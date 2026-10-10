-- Phase 5a: online booking and the clinic calendar
-- Run in Supabase: SQL Editor of project pmuecirfwmtsvojxleoq -> New query -> paste -> Run.
-- Safe to run more than once. Run AFTER phase2.sql, phase3-5.sql and patch-test-flag.sql.
--
-- What it adds
--   * time_off              blocked time (holidays, leave) hidden from the website
--   * appointments          no two booked appointments may overlap (the database refuses it)
--   * booking_requests      date of birth, address, medical alerts, heard-from, requested time
--   * get_open_slots()      public: free 40-minute blocks the website may offer (no names)
--   * submit_booking_request()  public: v2, takes the full new-patient details + a chosen block
--   * confirm_booking_request() signed in: creates/links the patient and books the block, atomically
--
-- Clinic rules live in clinic_slots() and get_open_slots() below. Keep them in step with
-- src/lib/schedule.ts (which has the same rules and unit tests).

create extension if not exists btree_gist;

-- Time -----------------------------------------------------------------------
-- The clock all booking rules use. Tests replace this function to pin the time.
create or replace function public.clinic_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;

-- End of an appointment. Immutable so it can sit in an exclusion constraint
-- (whole minutes only, so the timezone never matters).
create or replace function public.appointment_end(p_start timestamptz, p_minutes integer)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$ select p_start + p_minutes * interval '1 minute' $$;

-- The 13 clinic blocks of a day, as 40-minute starts in India time. They sit inside the
-- Google Business Profile hours (8:30 AM-1:00 PM, 2:30-7:30 PM): a block must end before closing.
--   8:30 9:10 9:50 10:30 11:10 11:50
--   2:30 3:10 3:50 4:30 5:10 5:50 6:30
-- Fridays have none.
create or replace function public.clinic_slots(p_date date)
returns setof timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_date::timestamp) + make_interval(mins => m)) at time zone 'Asia/Kolkata'
  from unnest(array[510, 550, 590, 630, 670, 710, 870, 910, 950, 990, 1030, 1070, 1110]) as m
  where extract(isodow from p_date) <> 5
$$;

create or replace function public.is_clinic_slot(p_start timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_start is not null and exists (
    select 1 from public.clinic_slots(((p_start at time zone 'Asia/Kolkata'))::date) s where s = p_start)
$$;

-- Time off -------------------------------------------------------------------
create table if not exists public.time_off (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists time_off_owner_starts_idx on public.time_off (owner_id, starts_at);

create or replace trigger time_off_set_updated_at
  before update on public.time_off
  for each row execute function public.set_updated_at();

alter table public.time_off enable row level security;

drop policy if exists "Owner full access" on public.time_off;
create policy "Owner full access" on public.time_off
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.time_off from anon;
grant select, insert, update, delete on public.time_off to authenticated;

-- No double booking ------------------------------------------------------------
do $$
begin
  alter table public.appointments
    add constraint appointments_no_overlap
    exclude using gist (
      owner_id with =,
      tstzrange(starts_at, public.appointment_end(starts_at, duration_min)) with &&
    ) where (status = 'booked');
exception when duplicate_object or duplicate_table then null;
end;
$$;

-- Booking requests: the new-patient details and the chosen block -------------------
alter table public.booking_requests
  add column if not exists address text check (char_length(address) <= 300),
  add column if not exists date_of_birth date,
  add column if not exists medical_alerts text check (char_length(medical_alerts) <= 1000),
  add column if not exists heard_from text check (char_length(heard_from) <= 100),
  add column if not exists requested_start timestamptz,
  add column if not exists is_test boolean not null default false;

create index if not exists booking_requests_owner_requested_idx
  on public.booking_requests (owner_id, requested_start) where status = 'new';

-- Free blocks the website may offer -------------------------------------------------
-- Rules: next 28 days; never Fridays; at least 2 hours from now; starts before 7 PM
-- (evenings are by phone); not overlapping a booked appointment, time off, or a
-- request still waiting (held for 24 hours). Returns start times only: no names.
create or replace function public.get_open_slots(p_from date default null, p_days integer default 28)
returns table (slot_start timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select c.clinic_owner_id as owner_id from public.app_config c where c.id
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
  where s.slot >= public.clinic_now() + interval '2 hours'
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
        and b.created_at > public.clinic_now() - interval '24 hours'
        and tstzrange(b.requested_start, public.appointment_end(b.requested_start, 40))
            && tstzrange(s.slot, public.appointment_end(s.slot, 40)))
  order by s.slot
$$;

-- Website booking v2 ----------------------------------------------------------------
-- The old nine-argument version is removed: nothing calls it any more.
drop function if exists public.submit_booking_request(text, text, text, text, text, date, text, text, boolean);

-- Called from the website with the publishable key. Returns the new request id.
-- Every failure raises an exception whose message is written to be shown to the visitor.
create or replace function public.submit_booking_request(
  p_name text,
  p_phone text,
  p_date_of_birth date,
  p_address text,
  p_medical_alerts text,
  p_heard_from text,
  p_reason text,
  p_notes text,
  p_requested_start timestamptz
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
  if p_date_of_birth is not null and (p_date_of_birth < date '1900-01-01' or p_date_of_birth > v_today) then
    raise exception 'Please check the date of birth.';
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
    owner_id, name, phone, address, date_of_birth, medical_alerts, heard_from,
    reason, notes, requested_start, preferred_date, preferred_time,
    is_emergency, is_test, client_ip, status, created_at
  )
  values (
    v_owner, v_name, v_phone, v_address, p_date_of_birth, v_alerts, v_heard,
    v_reason, v_notes, p_requested_start,
    (p_requested_start at time zone 'Asia/Kolkata')::date,
    to_char(p_requested_start at time zone 'Asia/Kolkata', 'HH12:MI AM'),
    false, v_name like 'E2E-%', v_ip, 'new', v_now
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_booking_request(text, text, date, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.submit_booking_request(text, text, date, text, text, text, text, text, timestamptz)
  to anon, authenticated;

revoke all on function public.get_open_slots(date, integer) from public, anon, authenticated;
grant execute on function public.get_open_slots(date, integer) to anon, authenticated;

-- Internal helpers are not callable from the website
revoke all on function public.clinic_now() from public, anon, authenticated;
revoke all on function public.appointment_end(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.clinic_slots(date) from public, anon, authenticated;
revoke all on function public.is_clinic_slot(timestamptz) from public, anon, authenticated;
grant execute on function public.clinic_now() to authenticated;
grant execute on function public.appointment_end(timestamptz, integer) to authenticated;
grant execute on function public.clinic_slots(date) to authenticated;
grant execute on function public.is_clinic_slot(timestamptz) to authenticated;

-- Confirm a request (signed in) ---------------------------------------------------------
-- One transaction: create the patient (or link an existing one), book the 40-minute
-- block, mark the request booked. Runs as the signed-in doctor, so row-level security
-- applies. Any failure rolls everything back.
create or replace function public.confirm_booking_request(
  p_request uuid,
  p_starts_at timestamptz,
  p_patient uuid default null
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
  v_today_start timestamptz := ((public.clinic_now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
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

  if not public.is_clinic_slot(p_starts_at) then
    raise exception 'Please choose one of the clinic time blocks (the clinic is closed on Fridays).';
  end if;
  if p_starts_at < v_today_start then
    raise exception 'That time has already passed.';
  end if;
  if exists (select 1 from public.time_off t
             where t.owner_id = (select auth.uid())
               and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, public.appointment_end(p_starts_at, 40))) then
    raise exception 'That time is blocked off in your calendar.';
  end if;

  if p_patient is not null then
    select p.id into v_patient from public.patients p
    where p.id = p_patient and p.owner_id = (select auth.uid());
    if v_patient is null then
      raise exception 'That patient was not found.';
    end if;
  else
    insert into public.patients (name, phone, date_of_birth, address, medical_alerts, heard_from, is_test)
    values (r.name, r.phone, r.date_of_birth, r.address, r.medical_alerts, r.heard_from, r.is_test)
    returning id into v_patient;
  end if;

  begin
    insert into public.appointments (patient_id, starts_at, duration_min, reason, status)
    values (
      v_patient, p_starts_at, 40,
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

revoke all on function public.confirm_booking_request(uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking_request(uuid, timestamptz, uuid) to authenticated;

-- Make the new tables, columns and functions visible to the app straight away
notify pgrst, 'reload schema';
