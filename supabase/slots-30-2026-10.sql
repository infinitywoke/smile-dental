-- 30-minute slots, and appointment lengths the doctor chooses (owner, 22 Oct 2026). Folded into
-- supabase/schema.sql. Replaces four functions; no rows change. Safe to run twice.
--
-- - The website offers 19 blocks a day, every 30 minutes within the Google hours (8:30 AM-1:00 PM,
--   2:30-7:30 PM), the last of each session ending at closing; online booking still stops at 7 PM.
-- - Clinic OS may book any length from 10 minutes to 4 hours in 5-minute steps, starting on a
--   5-minute mark of a session and ending by closing.
-- - Confirming a website request takes 30 minutes unless the doctor chose another length.
--
-- Appointments and requests already made stay as they are. Every start and length the app offered
-- before is still accepted (except a few minutes past closing), so this may run just before the new
-- app is deployed. Run it right before the deploy: until then the live website's own check turns
-- down the new half-hour times it doesn't know.

begin;

-- The 19 clinic blocks of a day, as 30-minute starts in India time, within the Google Business
-- Profile hours (8:30 AM-1:00 PM, 2:30-7:30 PM); the last block of each session ends at closing.
-- Online booking never offers 7 PM+.
--   8:30 9:00 9:30 10:00 10:30 11:00 11:30 12:00 12:30
--   2:30 3:00 3:30 4:00 4:30 5:00 5:30 6:00 6:30 7:00
-- Fridays have none.
create or replace function public.clinic_slots(p_date date)
returns setof timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_date::timestamp) + make_interval(mins => m)) at time zone 'Asia/Kolkata'
  from unnest(array[510, 540, 570, 600, 630, 660, 690, 720, 750, 870, 900, 930, 960, 990, 1020, 1050, 1080, 1110, 1140]) as m
  where extract(isodow from p_date) <> 5
$$;

-- A start where Clinic OS may book an appointment of p_minutes: any length the doctor chooses from 10
-- minutes to 4 hours in 5-minute steps, starting on a 5-minute mark of a session (from 8:30 AM / 2:30 PM)
-- and ending by closing (1:00 PM / 7:30 PM), not on a Friday. (The website keeps the 30-minute blocks of
-- clinic_slots.)
create or replace function public.is_clinic_start(p_start timestamptz, p_minutes integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    p_minutes between 10 and 240 and p_minutes % 5 = 0
    and extract(isodow from local) <> 5
    and extract(second from local) = 0
    and m % 5 = 0
    and ((m >= 510 and m + p_minutes <= 780)
      or (m >= 870 and m + p_minutes <= 1170)), false)
  from (select p_start at time zone 'Asia/Kolkata' as local,
               (extract(hour from p_start at time zone 'Asia/Kolkata') * 60
                + extract(minute from p_start at time zone 'Asia/Kolkata'))::int as m) t
$$;

create or replace function public.get_open_slots(p_from date default null, p_days integer default 28)
returns table (slot_start timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    -- None while online booking is paused
    select c.clinic_owner_id as owner_id from public.app_config c
    where c.id and (c.booking_paused_until is null or c.booking_paused_until <= public.clinic_now())
  ), today as (
    select (public.clinic_now() at time zone 'Asia/Kolkata')::date as d
  ), days as (
    select (greatest(coalesce(p_from, t.d), t.d) + i) as d
    from today t, generate_series(0, 27) as i
    where greatest(coalesce(p_from, t.d), t.d) + i <= t.d + 27
      and i < greatest(coalesce(p_days, 28), 0)
  )
  select s.slot as slot_start
  from cfg, days, lateral public.clinic_slots(days.d) as s(slot)
  where s.slot > public.clinic_now()
    and (s.slot at time zone 'Asia/Kolkata')::time < time '19:00'
    and not exists (
      select 1 from public.appointments a
      where a.owner_id = cfg.owner_id and a.status = 'booked'
        and tstzrange(a.starts_at, public.appointment_end(a.starts_at, a.duration_min))
            && tstzrange(s.slot, public.appointment_end(s.slot, 30)))
    and not exists (
      select 1 from public.time_off t
      where t.owner_id = cfg.owner_id
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(s.slot, public.appointment_end(s.slot, 30)))
    and not exists (
      select 1 from public.booking_requests b
      where b.owner_id = cfg.owner_id and b.status = 'new' and b.requested_start is not null
        and b.received_at is not null
        and public.request_hold_until(b.received_at, b.requested_start) > public.clinic_now()
        and tstzrange(b.requested_start, public.appointment_end(b.requested_start, 30))
            && tstzrange(s.slot, public.appointment_end(s.slot, 30)))
  order by s.slot
$$;

-- Confirm a request (signed in) ---------------------------------------------------------
-- One transaction: create the patient (or link an existing one), book the time (30 minutes
-- unless the doctor chose another length), mark the request booked. Runs as the signed-in doctor, so row-level security
-- applies. Any failure rolls everything back. A block that is already over is refused (the
-- block in progress may still be confirmed). When linking a patient already in the app, what the
-- request says under medical alerts is added to their record, never dropped.
create or replace function public.confirm_booking_request(
  p_request uuid,
  p_starts_at timestamptz,
  p_patient uuid default null,
  p_minutes integer default 30
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

commit;
