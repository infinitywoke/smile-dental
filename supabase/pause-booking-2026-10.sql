-- Pause online booking (22 Oct 2026). Run once in the Supabase SQL editor. Additive: one setting, two
-- small functions, and the website's two booking functions learn about the pause.
--
-- While online booking is paused the website shows no free times and takes no requests ("Online booking
-- is paused right now"). The dentist pauses it from the Cockpit, for the rest of today or until he turns
-- it back on. Booking inside Clinic OS is not affected.

alter table public.app_config add column if not exists booking_paused_until timestamptz;

-- Whether online booking is paused right now: until when, or null when it is open (the website and the app)
create or replace function public.booking_paused_until()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select c.booking_paused_until from public.app_config c
  where c.id and c.booking_paused_until > public.clinic_now()
$$;

revoke all on function public.booking_paused_until() from public, anon, authenticated;
grant execute on function public.booking_paused_until() to anon, authenticated;

-- The dentist pauses online booking until a time ('infinity': until turned back on), or opens it (null)
create or replace function public.set_booking_pause(p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.app_config c where c.id and c.clinic_owner_id = (select auth.uid())) then
    raise exception 'Not allowed';
  end if;
  update public.app_config set booking_paused_until = p_until where id;
end;
$$;

revoke all on function public.set_booking_pause(timestamptz) from public, anon, authenticated;
grant execute on function public.set_booking_pause(timestamptz) to authenticated;

-- Free times for the website: none while paused (otherwise unchanged) ------------------------------------
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
            && tstzrange(s.slot, public.appointment_end(s.slot, 40)))
    and not exists (
      select 1 from public.time_off t
      where t.owner_id = cfg.owner_id
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(s.slot, public.appointment_end(s.slot, 40)))
    and not exists (
      select 1 from public.booking_requests b
      where b.owner_id = cfg.owner_id and b.status = 'new' and b.requested_start is not null
        and b.received_at is not null
        and public.request_hold_until(b.received_at, b.requested_start) > public.clinic_now()
        and tstzrange(b.requested_start, public.appointment_end(b.requested_start, 40))
            && tstzrange(s.slot, public.appointment_end(s.slot, 40)))
  order by s.slot
$$;

revoke all on function public.get_open_slots(date, integer) from public, anon, authenticated;
grant execute on function public.get_open_slots(date, integer) to anon, authenticated;

-- A request from the website: refused while paused (otherwise unchanged) ---------------------------------
create or replace function public.submit_booking_request(
  p_name text,
  p_phone text,
  p_address text,
  p_medical_alerts text,
  p_heard_from text,
  p_reason text,
  p_notes text,
  p_requested_start timestamptz,
  p_gender text default null,
  p_birth_year integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_id uuid;
  v_now timestamptz := public.clinic_now();
  v_today date := (public.clinic_now() at time zone 'Asia/Kolkata')::date;
  v_name text := btrim(coalesce(p_name, ''), E' \t\r\n');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_address text := nullif(btrim(coalesce(p_address, ''), E' \t\r\n'), '');
  v_alerts text := nullif(btrim(coalesce(p_medical_alerts, ''), E' \t\r\n'), '');
  v_heard text := nullif(btrim(coalesce(p_heard_from, ''), E' \t\r\n'), '');
  v_reason text := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
  v_notes text := nullif(btrim(coalesce(p_notes, ''), E' \t\r\n'), '');
  v_gender text := nullif(lower(btrim(coalesce(p_gender, ''))), '');
  -- The visitor's IP as seen by the API gateway (first address in X-Forwarded-For)
  v_ip text := nullif(btrim(split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), '');
begin
  -- Phone: 10-digit Indian mobile (same rule as src/lib/phone.ts)
  if char_length(v_phone) = 12 and left(v_phone, 2) = '91' then
    v_phone := substr(v_phone, 3);
  elsif char_length(v_phone) = 11 and left(v_phone, 1) = '0' then
    v_phone := substr(v_phone, 2);
  end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Please enter a valid 10-digit mobile number.';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'Please enter your name (2 to 100 characters).';
  end if;
  if v_gender is not null and v_gender not in ('female', 'male', 'other') then
    raise exception 'Please choose female, male or other.';
  end if;
  if p_birth_year is not null and (p_birth_year < 1900 or p_birth_year > extract(year from v_today)::integer) then
    raise exception 'Please check the age.';
  end if;
  if char_length(v_address) > 300 then
    raise exception 'Address must be 300 characters or fewer.';
  end if;
  if char_length(v_alerts) > 1000 then
    raise exception 'Medical alerts must be 1000 characters or fewer.';
  end if;
  if char_length(v_heard) > 100 then
    raise exception 'That answer is too long.';
  end if;
  if char_length(v_reason) > 200 then
    raise exception 'Reason must be 200 characters or fewer.';
  end if;
  if char_length(v_notes) > 1000 then
    raise exception 'Notes must be 1000 characters or fewer.';
  end if;
  if p_requested_start is null or not public.is_clinic_slot(p_requested_start) then
    raise exception 'Please choose one of the available times.';
  end if;
  if (p_requested_start at time zone 'Asia/Kolkata')::time >= time '19:00' then
    raise exception 'For appointments from 7 PM, please call the clinic.';
  end if;

  select c.clinic_owner_id into v_owner from public.app_config c where c.id;
  if v_owner is null then
    raise exception 'Online booking is not set up yet. Please call or WhatsApp the clinic.';
  end if;
  if exists (select 1 from public.app_config c where c.id and c.booking_paused_until > v_now) then
    raise exception 'Online booking is paused right now. Please call or WhatsApp the clinic.';
  end if;

  -- Rate limits and the free-block check. The lock makes concurrent submissions
  -- run one at a time, so two visitors can never take the same block.
  perform pg_advisory_xact_lock(hashtext('public.submit_booking_request'));
  if exists (select 1 from public.booking_requests b
             where b.phone = v_phone and b.status = 'new' and b.created_at > v_now - interval '24 hours') then
    raise exception 'You already have a request waiting. The clinic will confirm it on WhatsApp shortly.';
  end if;
  if (select count(*) from public.booking_requests b
      where b.phone = v_phone and b.created_at > v_now - interval '24 hours') >= 3 then
    raise exception 'We already have your requests from this number today. The clinic will contact you soon, or please call or WhatsApp the clinic.';
  end if;
  if v_ip is not null and (select count(*) from public.booking_requests b
      where b.client_ip = v_ip and b.created_at > v_now - interval '24 hours') >= 5 then
    raise exception 'We already have several requests from this device today. Please call or WhatsApp the clinic.';
  end if;
  if (select count(*) from public.booking_requests b
      where b.created_at > v_now - interval '24 hours') >= 200 then
    raise exception 'Online booking is busy right now. Please call or WhatsApp the clinic.';
  end if;

  if not exists (select 1 from public.get_open_slots(null, 28) o where o.slot_start = p_requested_start) then
    raise exception 'That time is no longer available. Please choose another.';
  end if;

  insert into public.booking_requests (
    owner_id, name, phone, gender, birth_year, address, medical_alerts, heard_from,
    reason, notes, requested_start, client_ip, status, created_at
  )
  values (
    v_owner, v_name, v_phone, v_gender, p_birth_year, v_address, v_alerts, v_heard,
    v_reason, v_notes, p_requested_start, v_ip, 'new', v_now
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_booking_request(text, text, text, text, text, text, text, timestamptz, text, integer)
  from public, anon, authenticated;
grant execute on function public.submit_booking_request(text, text, text, text, text, text, text, timestamptz, text, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
