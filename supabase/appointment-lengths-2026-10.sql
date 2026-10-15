-- Appointment lengths (owner, 15 Oct 2026): Dr. Rahil books 20, 40, 60, 80 or 120 minutes, starting on a
-- 20-minute grid within the sessions. The website keeps its 40-minute blocks (clinic_slots, get_open_slots).
-- Confirming a website request can take another length (p_minutes, 40 by default, so the app's current
-- call keeps working). Safe to run twice. Folded into supabase/schema.sql.

begin;

-- A start where Clinic OS may book an appointment of p_minutes: on the 20-minute grid of a session
-- (8:30 AM / 2:30 PM), ending by 1:10 PM / 7:50 PM, not on a Friday, and one of the clinic's lengths.
-- (The website keeps the 40-minute blocks of clinic_slots.)
create or replace function public.is_clinic_start(p_start timestamptz, p_minutes integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    p_minutes in (20, 40, 60, 80, 120)
    and extract(isodow from local) <> 5
    and extract(second from local) = 0
    and ((m >= 510 and (m - 510) % 20 = 0 and m + p_minutes <= 790)
      or (m >= 870 and (m - 870) % 20 = 0 and m + p_minutes <= 1190)), false)
  from (select p_start at time zone 'Asia/Kolkata' as local,
               (extract(hour from p_start at time zone 'Asia/Kolkata') * 60
                + extract(minute from p_start at time zone 'Asia/Kolkata'))::int as m) t
$$;

drop function if exists public.confirm_booking_request(uuid, timestamptz, uuid);
create or replace function public.confirm_booking_request(
  p_request uuid,
  p_starts_at timestamptz,
  p_patient uuid default null,
  p_minutes integer default 40
)
returns table (patient_id uuid, appointment_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.booking_requests;
  v_patient uuid;
  v_appointment uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Please sign in.';
  end if;

  select * into r from public.booking_requests b
  where b.id = p_request and b.owner_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'That request was not found.';
  end if;
  if r.status not in ('new', 'contacted') then
    raise exception 'This request has already been handled.';
  end if;

  if not public.is_clinic_start(p_starts_at, p_minutes) then
    raise exception 'Please choose one of the clinic time blocks (the clinic is closed on Fridays).';
  end if;
  if public.appointment_end(p_starts_at, p_minutes) <= public.clinic_now() then
    raise exception 'That time has already passed.';
  end if;
  if exists (select 1 from public.time_off t
             where t.owner_id = (select auth.uid())
               and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, public.appointment_end(p_starts_at, p_minutes))) then
    raise exception 'That time is blocked off in your calendar.';
  end if;

  if p_patient is not null then
    select p.id into v_patient from public.patients p
    where p.id = p_patient and p.owner_id = (select auth.uid());
    if v_patient is null then
      raise exception 'That patient was not found.';
    end if;
    if nullif(btrim(r.medical_alerts), '') is not null then
      update public.patients p
      set medical_alerts = case
        when nullif(btrim(p.medical_alerts), '') is null then r.medical_alerts
        when position(lower(btrim(r.medical_alerts)) in lower(p.medical_alerts)) > 0 then p.medical_alerts
        else p.medical_alerts || E'\n' || r.medical_alerts
             || ' (website, ' || to_char(r.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') || ')'
      end
      where p.id = v_patient;
    end if;
  else
    insert into public.patients (name, phone, gender, birth_year, address, medical_alerts, heard_from)
    values (r.name, r.phone, r.gender, r.birth_year, r.address, r.medical_alerts, r.heard_from)
    returning id into v_patient;
  end if;

  begin
    insert into public.appointments (patient_id, starts_at, duration_min, reason, status)
    values (
      v_patient, p_starts_at, p_minutes,
      coalesce(nullif(concat_ws(' - ', r.reason, r.notes), ''), ''),
      'booked'
    )
    returning id into v_appointment;
  exception when exclusion_violation then
    raise exception 'That time was just taken. Please choose another block.';
  end;

  update public.booking_requests b
  set status = 'booked', patient_id = v_patient, appointment_id = v_appointment
  where b.id = r.id;

  return query select v_patient, v_appointment;
end;
$$;

revoke all on function public.confirm_booking_request(uuid, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.confirm_booking_request(uuid, timestamptz, uuid, integer) to authenticated;

commit;

notify pgrst, 'reload schema';
