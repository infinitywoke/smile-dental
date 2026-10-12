-- Clean-up of unused tables and columns (simplification build, C23, 12 Oct 2026).
--
-- Run ONCE on the live database, straight after the matching app version is deployed:
--   npx supabase db query --linked --project-ref pmuecirfwmtsvojxleoq --file supabase/cleanup-2026-10.sql
-- Take a backup first. It runs in one transaction: if anything fails, nothing changes.
-- Afterwards the database equals supabase/schema.sql.
--
-- Steps: keep every age, drop the unused tables, drop the unused columns,
-- recreate the two booking functions without the dropped columns.

begin;

-- 1. Keep every age: birth year from the date of birth where it is missing.
update public.patients set birth_year = extract(year from date_of_birth)::smallint
  where birth_year is null and date_of_birth is not null;
update public.booking_requests set birth_year = extract(year from date_of_birth)::smallint
  where birth_year is null and date_of_birth is not null;

-- 2. The booking functions use the columns being dropped: remove them first.
drop function if exists public.submit_booking_request(text, text, date, text, text, text, text, text, timestamptz, text, integer);
drop function if exists public.confirm_booking_request(uuid, timestamptz, uuid);

-- 3. Tables nobody uses. (share_links and app_config stay.)
drop table if exists public.reminder_log;
drop table if exists public.expenses;
drop table if exists public.recurring_expenses;
drop table if exists public.day_closes;

-- visit_charges' policy mentions treatment_items: replace it before the table goes.
drop policy if exists "Owner full access" on public.visit_charges;
drop table if exists public.treatment_items cascade;
alter table public.visit_charges drop column if exists treatment_item_id;
create policy "Owner full access" on public.visit_charges
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.visits v
                where v.id = visit_charges.visit_id and v.owner_id = (select auth.uid())
                  and v.patient_id = visit_charges.patient_id)
  );

-- The receipts photo store and its three policies
drop policy if exists "Owner reads own expense receipts" on storage.objects;
drop policy if exists "Owner uploads own expense receipts" on storage.objects;
drop policy if exists "Owner deletes own expense receipts" on storage.objects;
delete from storage.objects where bucket_id = 'expense-receipts';
delete from storage.buckets where id = 'expense-receipts';

-- 4. Columns nobody uses.
drop index if exists public.patients_owner_test_idx;
alter table public.visits
  drop column if exists summary, drop column if exists notes_original, drop column if exists confirmed_at;
alter table public.patients
  drop column if exists preferred_times, drop column if exists is_test, drop column if exists date_of_birth;
alter table public.booking_requests
  drop column if exists date_of_birth, drop column if exists area, drop column if exists city,
  drop column if exists preferred_date, drop column if exists preferred_time,
  drop column if exists is_emergency, drop column if exists is_test;
alter table public.appointments drop column if exists reminder_sent_at;
alter table public.payments drop column if exists kind, drop column if exists reference;

-- 5. The booking functions again, without the dropped columns (same rules, same messages, same grants).
-- Called from the website with the publishable key. Returns the new request id.
-- Every failure raises an exception whose message is written to be shown to the visitor.
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
    insert into public.patients (name, phone, gender, birth_year, address, medical_alerts, heard_from)
    values (r.name, r.phone, r.gender, r.birth_year, r.address, r.medical_alerts, r.heard_from)
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

commit;

notify pgrst, 'reload schema';
