-- Smile Dental: the whole database, in one file.
--
-- This is the database as it is after supabase/cleanup-2026-10.sql and
-- supabase/logic-fixes-2026-10.sql. Run it on an EMPTY
-- Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run (or
-- `npx supabase db query --linked --file supabase/schema.sql`). It is safe to run again.
-- The live project already has all of this: do not run it there for any other reason.
--
-- Tables
--   patients, visits, visit_photos      the clinic record (photos live in the private visit-photos bucket)
--   visit_charges, payments             the bill of a visit and the money received
--   appointments, time_off              the calendar (no two booked appointments may overlap)
--   booking_requests                    asks from the website, handled in the app
--   share_links                         private /r/<token> links (kept for the optional prescription link)
--   app_config                          which account owns the clinic (one row)
--
-- Rules shared by every table:
--   * owner_id defaults to the signed-in user; row-level security "Owner full access".
--   * Rows that point at a patient or visit may only point at rows the same owner owns.
--   * anon gets nothing. The public website can only call get_open_slots() and
--     submit_booking_request().
--   * Money is numeric(10,2) rupees.
--   * Clinic booking rules live in clinic_slots() and get_open_slots(). Keep them in step with
--     src/lib/schedule.ts (same rules, with unit tests).
--
-- After the tables exist, create the doctor's login (Authentication -> Users), then run
--   insert into public.app_config (clinic_owner_id) select id from auth.users where email = '<doctor email>';
-- (the statement near the end of this file does it for the clinic's own address).
--
-- The check supabase/tests/booking.check.mjs builds a throwaway database from this file.

create extension if not exists btree_gist;

-- Keeps updated_at current on every edit
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Clinic time ------------------------------------------------------------------
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

create or replace function public.is_clinic_slot(p_start timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_start is not null and exists (
    select 1 from public.clinic_slots(((p_start at time zone 'Asia/Kolkata'))::date) s where s = p_start)
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

-- App config: which account owns the clinic (single row) ----------------------
-- Used by submit_booking_request() to know whose list a website request lands in.
create table if not exists public.app_config (
  id boolean primary key default true check (id),
  clinic_owner_id uuid not null references auth.users (id) on delete cascade,
  -- Online booking is paused until then ('infinity': until the dentist turns it back on)
  booking_paused_until timestamptz
);

-- Patients ------------------------------------------------------------------
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,                 -- 10-digit Indian mobile, digits only
  gender text check (gender in ('female', 'male', 'other')),
  birth_year smallint check (birth_year between 1900 and 2100), -- age is shown as this year's age
  birth_date date check (birth_date >= date '1900-01-01'), -- when known; birth_year is kept in step
  address text,
  medical_alerts text,        -- allergies, conditions, regular medicines
  heard_from text,            -- how they heard about the clinic
  recalled_at timestamptz,    -- the 6-month check-up reminder was sent (or skipped)
  review_asked_at timestamptz, -- the Google review request was sent on WhatsApp
  tally_ledger text check (char_length(tally_ledger) between 1 and 100), -- the patient's ledger in Tally
  tally_ledger_listed boolean not null default false, -- seen in his List of Accounts (else each file creates it)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patients add column if not exists recalled_at timestamptz;
alter table public.patients add column if not exists review_asked_at timestamptz;
alter table public.patients add column if not exists tally_ledger text check (char_length(tally_ledger) between 1 and 100);
alter table public.patients add column if not exists tally_ledger_listed boolean not null default false;

create index if not exists patients_owner_phone_idx on public.patients (owner_id, phone);
create index if not exists patients_owner_name_idx on public.patients (owner_id, lower(name));

create or replace trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

-- Visits --------------------------------------------------------------------
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  visit_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  notes text not null default '',
  closed_at timestamptz,      -- when the visit was finished and marked done
  resend_needed boolean not null default false, -- the bill changed after the WhatsApp was sent
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visits_owner_date_idx on public.visits (owner_id, visit_date desc, created_at desc);
create index if not exists visits_patient_idx on public.visits (patient_id, visit_date desc, created_at desc);
create index if not exists visits_owner_closed_idx on public.visits (owner_id, closed_at);
-- One visit per patient per day: "Start visit" always reuses today's visit
create unique index if not exists visits_one_per_patient_day on public.visits (patient_id, visit_date);

create or replace trigger visits_set_updated_at
  before update on public.visits
  for each row execute function public.set_updated_at();

-- Visit photos (prescriptions, external X-rays / CT scans, ...) ---------------
create table if not exists public.visit_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  visit_id uuid not null references public.visits (id) on delete cascade,
  storage_path text not null unique,
  caption text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists visit_photos_visit_idx on public.visit_photos (visit_id, created_at);

-- Visit charges: the bill lines of a visit -----------------------------------
create table if not exists public.visit_charges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  visit_id uuid not null references public.visits (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  description text not null default '',         -- may be blank for an unlabelled extra line
  amount numeric(10,2) not null,                -- below zero only for a discount (checks below)
  kind text not null default 'item',
  treatment_slug text,                          -- price-list slug from src/config/site.ts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visit_charges_visit_idx on public.visit_charges (visit_id, created_at);
create index if not exists visit_charges_patient_idx on public.visit_charges (patient_id);
create index if not exists visit_charges_owner_created_idx on public.visit_charges (owner_id, created_at desc);

create or replace trigger visit_charges_set_updated_at
  before update on public.visit_charges
  for each row execute function public.set_updated_at();

-- Payments: money received ---------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  -- Every payment belongs to a visit. A visit that holds money cannot be deleted: its payments are
  -- removed one by one first (deleting the patient still removes everything).
  visit_id uuid not null references public.visits (id) on delete restrict,
  amount numeric(10,2) not null check (amount > 0),
  method text not null check (method in ('upi', 'cash')),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_owner_received_idx on public.payments (owner_id, received_at desc);
create index if not exists payments_patient_idx on public.payments (patient_id, received_at desc);
create index if not exists payments_visit_idx on public.payments (visit_id);

create or replace trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- "WhatsApp sent" means the patient has the current bill: any change to a sent visit's charges or
-- payments sets resend_needed (markWhatsappSent clears it).
create or replace function public.mark_bill_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.visits v
  set resend_needed = true
  where v.id in (old.visit_id, new.visit_id)   -- old is null on insert, new is null on delete
    and v.closed_at is not null
    and not v.resend_needed;
  return null;
end;
$$;

create or replace trigger visit_charges_bill_changed
  after insert or update or delete on public.visit_charges
  for each row execute function public.mark_bill_changed();
create or replace trigger payments_bill_changed
  after insert or update or delete on public.payments
  for each row execute function public.mark_bill_changed();

-- Share links: private /r/<token> page ----------------------------------------
-- The token is 64 hex characters from two gen_random_uuid() calls (~244 random
-- bits, built in, no extension needed). The /r page reads it server-side with
-- the secret key; RLS below only lets the owner manage their own links.
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  visit_id uuid not null references public.visits (id) on delete cascade,
  token text not null unique
    default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
    check (length(token) >= 32),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now() -- set expires_at = now() to revoke a link
);

create index if not exists share_links_visit_idx on public.share_links (visit_id);

create or replace trigger share_links_set_updated_at
  before update on public.share_links
  for each row execute function public.set_updated_at();

-- Appointments --------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  starts_at timestamptz not null,
  duration_min integer not null default 30 check (duration_min between 5 and 480),
  reason text not null default '',
  status text not null default 'booked'
    check (status in ('booked', 'done', 'cancelled', 'no_show')),
  from_visit_id uuid references public.visits (id) on delete set null, -- visit where it was booked
  visit_id uuid references public.visits (id) on delete set null,      -- visit that happened at it
  reminded_at timestamptz,    -- the day-before reminder WhatsApp was opened
  followed_up_at timestamptz, -- a missed appointment was followed up from the call-back list
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments add column if not exists reminded_at timestamptz;
alter table public.appointments add column if not exists followed_up_at timestamptz;

create index if not exists appointments_owner_starts_idx on public.appointments (owner_id, starts_at);
create index if not exists appointments_patient_idx on public.appointments (patient_id, starts_at desc);
create index if not exists appointments_from_visit_idx on public.appointments (from_visit_id);
create index if not exists appointments_visit_idx on public.appointments (visit_id);
create index if not exists appointments_owner_missed_idx
  on public.appointments (owner_id, starts_at desc) where status = 'no_show';

create or replace trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- No double booking: the database refuses overlapping booked appointments (multi-clinic slice 2a, at the
-- end, makes it one per chair and one per dentist; this one is not brought back once that is in)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_chair_free') then
    alter table public.appointments
      add constraint appointments_no_overlap
      exclude using gist (
        owner_id with =,
        tstzrange(starts_at, public.appointment_end(starts_at, duration_min)) with &&
      ) where (status = 'booked');
  end if;
exception when duplicate_object or duplicate_table then null;
end;
$$;

-- Time off: blocked time (holidays, leave) hidden from the website -------------
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

-- A booked appointment is never in blocked time or already over, whichever screen or action made or
-- moved it. Status changes (done, cancelled) are not checked, so Send and Cancel still work on past
-- appointments.
create or replace function public.check_appointment_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'booked' and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at
                                or new.duration_min is distinct from old.duration_min) then
    if public.appointment_end(new.starts_at, new.duration_min) <= public.clinic_now() then
      raise exception 'That time has already passed.';
    end if;
    if exists (select 1 from public.time_off t
               where t.owner_id = new.owner_id
                 and tstzrange(t.starts_at, t.ends_at)
                     && tstzrange(new.starts_at, public.appointment_end(new.starts_at, new.duration_min))) then
      raise exception 'That time is blocked off in your calendar.';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger appointments_check_time
  before insert or update on public.appointments
  for each row execute function public.check_appointment_time();

-- Booking requests from the public website ------------------------------------
-- Inserted only through public.submit_booking_request(...) below.
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  gender text check (gender in ('female', 'male', 'other')),
  birth_year smallint check (birth_year between 1900 and 2100),
  address text check (char_length(address) <= 300),
  medical_alerts text check (char_length(medical_alerts) <= 1000),
  heard_from text check (char_length(heard_from) <= 100),
  reason text check (char_length(reason) <= 200),
  notes text check (char_length(notes) <= 1000),
  requested_start timestamptz,
  client_ip text,                               -- for rate limiting only
  status text not null default 'new'
    check (status in ('new', 'contacted', 'booked', 'declined')),
  patient_id uuid references public.patients (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  -- When the request's WhatsApp reached the clinic (Dr. Rahil opened its link): the time is held from then
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.booking_requests add column if not exists received_at timestamptz;

create index if not exists booking_requests_owner_status_idx on public.booking_requests (owner_id, status, created_at desc);
create index if not exists booking_requests_phone_created_idx on public.booking_requests (phone, created_at desc);
create index if not exists booking_requests_created_idx on public.booking_requests (created_at desc);
create index if not exists booking_requests_ip_created_idx on public.booking_requests (client_ip, created_at desc);
create index if not exists booking_requests_patient_idx on public.booking_requests (patient_id);
create index if not exists booking_requests_appointment_idx on public.booking_requests (appointment_id);
create index if not exists booking_requests_owner_requested_idx
  on public.booking_requests (owner_id, requested_start) where status = 'new';

create or replace trigger booking_requests_set_updated_at
  before update on public.booking_requests
  for each row execute function public.set_updated_at();

-- Seed app_config with Dr. Rahil's account. If that login does not exist yet, this inserts
-- nothing and website requests fail with "Online booking is not set up yet"; create the
-- login, then run this statement again. To point at a different account later:
--   update public.app_config set clinic_owner_id = (select id from auth.users where email = '<email>');
insert into public.app_config (clinic_owner_id)
select id from auth.users where email = 'smiledental8925@gmail.com'
on conflict (id) do nothing;

-- Access: only the signed-in owner can see or change their own rows ---------
alter table public.patients enable row level security;
alter table public.visits enable row level security;
alter table public.visit_photos enable row level security;
alter table public.visit_charges enable row level security;
alter table public.payments enable row level security;
alter table public.share_links enable row level security;
alter table public.appointments enable row level security;
alter table public.time_off enable row level security;
alter table public.booking_requests enable row level security;
alter table public.app_config enable row level security;

drop policy if exists "Owner full access" on public.patients;
create policy "Owner full access" on public.patients
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- A visit must be for one of the caller's patients, and a photo on one of the caller's visits.
drop policy if exists "Owner full access" on public.visits;
create policy "Owner full access" on public.visits
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.patients p
                where p.id = visits.patient_id and p.owner_id = (select auth.uid()))
  );

drop policy if exists "Owner full access" on public.visit_photos;
create policy "Owner full access" on public.visit_photos
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.visits v
                where v.id = visit_photos.visit_id and v.owner_id = (select auth.uid()))
    and visit_photos.storage_path like (select auth.uid())::text || '/' || visit_photos.visit_id::text || '/%'
  );

-- Where a row links to a visit and a patient, the visit must belong to the
-- same patient as well as to the caller.
drop policy if exists "Owner full access" on public.visit_charges;
create policy "Owner full access" on public.visit_charges
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.visits v
                where v.id = visit_charges.visit_id and v.owner_id = (select auth.uid())
                  and v.patient_id = visit_charges.patient_id)
  );

drop policy if exists "Owner full access" on public.payments;
create policy "Owner full access" on public.payments
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.visits v
                where v.id = payments.visit_id and v.owner_id = (select auth.uid())
                  and v.patient_id = payments.patient_id)
  );

drop policy if exists "Owner full access" on public.share_links;
create policy "Owner full access" on public.share_links
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.visits v
                where v.id = share_links.visit_id and v.owner_id = (select auth.uid()))
  );

drop policy if exists "Owner full access" on public.appointments;
create policy "Owner full access" on public.appointments
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.patients p
                where p.id = appointments.patient_id and p.owner_id = (select auth.uid()))
    and (appointments.from_visit_id is null or exists (
          select 1 from public.visits v
          where v.id = appointments.from_visit_id and v.owner_id = (select auth.uid())
            and v.patient_id = appointments.patient_id))
    and (appointments.visit_id is null or exists (
          select 1 from public.visits v
          where v.id = appointments.visit_id and v.owner_id = (select auth.uid())
            and v.patient_id = appointments.patient_id))
  );

drop policy if exists "Owner full access" on public.time_off;
create policy "Owner full access" on public.time_off
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owner full access" on public.booking_requests;
create policy "Owner full access" on public.booking_requests
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (booking_requests.patient_id is null or exists (
          select 1 from public.patients p
          where p.id = booking_requests.patient_id and p.owner_id = (select auth.uid())))
    and (booking_requests.appointment_id is null or exists (
          select 1 from public.appointments a
          where a.id = booking_requests.appointment_id and a.owner_id = (select auth.uid())))
  );

-- app_config is read-only from the app; change it in the SQL Editor
drop policy if exists "Owner reads config" on public.app_config;
create policy "Owner reads config" on public.app_config
  for select to authenticated
  using (clinic_owner_id = (select auth.uid()));

revoke all on
  public.patients, public.visits, public.visit_photos, public.visit_charges, public.payments,
  public.share_links, public.appointments, public.time_off, public.booking_requests, public.app_config
from anon;

grant select, insert, update, delete on
  public.patients, public.visits, public.visit_photos, public.visit_charges, public.payments,
  public.share_links, public.appointments, public.time_off, public.booking_requests
to authenticated;

revoke all on public.app_config from authenticated;
grant select on public.app_config to authenticated;

-- Photo storage: private bucket, files stored under <owner id>/<visit id>/ ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-photos', 'visit-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Owner reads own visit photos" on storage.objects;
create policy "Owner reads own visit photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owner uploads own visit photos" on storage.objects;
create policy "Owner uploads own visit photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owner deletes own visit photos" on storage.objects;
create policy "Owner deletes own visit photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Free blocks the website may offer -------------------------------------------------
-- Rules: next 28 days; never Fridays; not started yet (no notice needed since 21 Oct 2026); starts before 7 PM
-- (evenings are by phone); not overlapping a booked appointment, time off, or a
-- request held after its WhatsApp reached the clinic (see request_hold_until). Start times only: no names.
create or replace function public.request_hold_until(p_received timestamptz, p_start timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_until timestamptz;
  v_local timestamp;
  v_day date;
begin
  if p_received is null or p_start is null then
    return null;
  end if;
  v_until := p_received + interval '2 hours';
  v_local := v_until at time zone 'Asia/Kolkata';
  if to_char(v_local, 'HH24:MI') > '19:30' or to_char(v_local, 'HH24:MI') < '08:30' then
    v_day := v_local::date + case when to_char(v_local, 'HH24:MI') > '19:30' then 1 else 0 end;
    while extract(isodow from v_day) = 5 loop
      v_day := v_day + 1;
    end loop;
    v_until := (v_day + time '10:30') at time zone 'Asia/Kolkata';
  end if;
  return least(v_until, p_start);
end;
$$;

revoke all on function public.request_hold_until(timestamptz, timestamptz) from public, anon, authenticated;

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

revoke all on function public.get_open_slots(date, integer) from public, anon, authenticated;
grant execute on function public.get_open_slots(date, integer) to anon, authenticated;

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

-- Internal helpers are not callable from the website
revoke all on function public.clinic_now() from public, anon, authenticated;
revoke all on function public.appointment_end(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.clinic_slots(date) from public, anon, authenticated;
revoke all on function public.is_clinic_slot(timestamptz) from public, anon, authenticated;
grant execute on function public.clinic_now() to authenticated;
grant execute on function public.appointment_end(timestamptz, integer) to authenticated;
grant execute on function public.clinic_slots(date) to authenticated;
grant execute on function public.is_clinic_slot(timestamptz) to authenticated;

-- Website booking and confirming ---------------------------------------------------------
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

-- Confirm a request (signed in) ---------------------------------------------------------
-- One transaction: create the patient (or link an existing one), book the time (30 minutes
-- unless the doctor chose another length), mark the request booked. Runs as the signed-in doctor, so row-level security
-- applies. Any failure rolls everything back. A block that is already over is refused (the
-- block in progress may still be confirmed). When linking a patient already in the app, what the
-- request says under medical alerts is added to their record, never dropped.
drop function if exists public.confirm_booking_request(uuid, timestamptz, uuid);
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

revoke all on function public.confirm_booking_request(uuid, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.confirm_booking_request(uuid, timestamptz, uuid, integer) to authenticated;

revoke all on function public.mark_bill_changed() from public, anon, authenticated;
revoke all on function public.check_appointment_time() from public, anon, authenticated;

-- Money per visit in one place: every screen reads charged and paid from here and
-- applies one rule in src/lib/billing.ts. security_invoker: row-level security applies as usual.
create or replace view public.visit_money with (security_invoker = true) as
  select v.id as visit_id, v.patient_id, v.visit_date, v.created_at, v.closed_at, v.resend_needed,
    coalesce((select sum(c.amount) from public.visit_charges c where c.visit_id = v.id), 0)::numeric(12,2) as charged,
    coalesce((select sum(p.amount) from public.payments p where p.visit_id = v.id), 0)::numeric(12,2) as paid
  from public.visits v;
revoke all on public.visit_money from anon;
grant select on public.visit_money to authenticated;

notify pgrst, 'reload schema';

-- Patient voice notes on website requests (the 'page' / 'whatsapp' test) -------------------------
alter table public.booking_requests add column if not exists voice_variant text
  check (voice_variant in ('page', 'whatsapp'));
alter table public.booking_requests add column if not exists voice_note text
  check (char_length(voice_note) <= 200);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-voice', 'request-voice', false, 1048576,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- May the website still attach a voice note to the request this file is named after ("<request id>.webm")?
create or replace function public.voice_note_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.booking_requests b
    where b.id::text = split_part(p_name, '.', 1)
      and b.status = 'new'
      and b.voice_note is null
      and b.created_at > public.clinic_now() - interval '15 minutes')
$$;

revoke all on function public.voice_note_allowed(text) from public, anon, authenticated;
grant execute on function public.voice_note_allowed(text) to anon, authenticated;

drop policy if exists "Website uploads a voice note for its request" on storage.objects;
create policy "Website uploads a voice note for its request" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'request-voice' and public.voice_note_allowed(name));

drop policy if exists "Owner plays request voice notes" on storage.objects;
create policy "Owner plays request voice notes" on storage.objects
  for select to authenticated
  using (bucket_id = 'request-voice' and exists (
    select 1 from public.booking_requests b
    where b.id::text = split_part(storage.objects.name, '.', 1) and b.owner_id = (select auth.uid())));

drop policy if exists "Owner deletes request voice notes" on storage.objects;
create policy "Owner deletes request voice notes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'request-voice' and exists (
    select 1 from public.booking_requests b
    where b.id::text = split_part(storage.objects.name, '.', 1) and b.owner_id = (select auth.uid())));

-- Records which version the visitor saw and, for the page version, the uploaded note. Once only, and
-- only within 15 minutes of the request.
create or replace function public.set_request_voice(p_request uuid, p_variant text, p_path text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_variant is null or p_variant not in ('page', 'whatsapp') then
    raise exception 'Invalid voice note.';
  end if;
  if p_path is not null then
    if p_path !~ ('^' || p_request::text || '\.(webm|ogg|m4a|mp4|mp3|aac)$') then
      raise exception 'Invalid voice note.';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'request-voice' and o.name = p_path) then
      raise exception 'The voice note did not upload.';
    end if;
  end if;
  update public.booking_requests b
  set voice_variant = p_variant, voice_note = p_path
  where b.id = p_request
    and b.status = 'new'
    and b.voice_variant is null
    and b.created_at > public.clinic_now() - interval '15 minutes';
end;
$$;

revoke all on function public.set_request_voice(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_request_voice(uuid, text, text) to anon, authenticated;

-- Visit recordings (Record notes): kept privately with the visit ------------------------------------
create table if not exists public.visit_recordings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  visit_id uuid not null references public.visits (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  seconds integer check (seconds between 0 and 3600),
  created_at timestamptz not null default now()
);

create index if not exists visit_recordings_visit_idx on public.visit_recordings (visit_id, created_at);

alter table public.visit_recordings enable row level security;

drop policy if exists "Owner full access" on public.visit_recordings;
create policy "Owner full access" on public.visit_recordings
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.visits v
                where v.id = visit_recordings.visit_id and v.owner_id = (select auth.uid()))
    and visit_recordings.storage_path like (select auth.uid())::text || '/' || visit_recordings.visit_id::text || '/%'
  );

revoke all on public.visit_recordings from anon;
grant select, insert, update, delete on public.visit_recordings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-audio', 'visit-audio', false, 5242880,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owner plays own visit recordings" on storage.objects;
create policy "Owner plays own visit recordings" on storage.objects
  for select to authenticated
  using (bucket_id = 'visit-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owner uploads own visit recordings" on storage.objects;
create policy "Owner uploads own visit recordings" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'visit-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owner deletes own visit recordings" on storage.objects;
create policy "Owner deletes own visit recordings" on storage.objects
  for delete to authenticated
  using (bucket_id = 'visit-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Send to Tally: the dentist's ledger names and what the last file covered ---------------------------
create table if not exists public.tally_settings (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  cash_ledger text not null check (char_length(cash_ledger) between 1 and 100),
  bank_ledger text not null check (char_length(bank_ledger) between 1 and 100),
  income_ledger text check (char_length(income_ledger) between 1 and 100), -- only for one entry per day
  entries text not null default 'payment' check (entries in ('payment', 'day')),
  sent_from timestamptz,  -- the last "new payments" file: payments recorded after this…
  sent_until timestamptz, -- …up to this moment
  updated_at timestamptz not null default now()
);
alter table public.tally_settings alter column income_ledger drop not null;

alter table public.tally_settings enable row level security;

drop policy if exists "Owner full access" on public.tally_settings;
create policy "Owner full access" on public.tally_settings
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.tally_settings from anon;
grant select, insert, update, delete on public.tally_settings to authenticated;

create or replace trigger tally_settings_set_updated_at
  before update on public.tally_settings
  for each row execute function public.set_updated_at();

-- Notifications on the installed Clinic OS (21 Oct 2026, supabase/notifications-2026-10.sql; the scheduler job and
-- its Vault secret are set up by the live-only part of that file).
-- Additive: three new tables, five functions, and (in the last part) the scheduler job and its secret.
--
-- How it works: the phone that turns notifications on is saved in push_subscriptions. When a website
-- request comes in, the app asks notify_new_request() what to send; every 5 minutes the scheduler asks
-- the app, which asks notify_due() (a request still waiting after 30 minutes, the morning brief). Those
-- functions answer only to a secret kept in Supabase Vault, and they return just what each notification
-- needs: no admin key is ever given to the app. Each notification is logged, so it goes once.

-- The phones that turned notifications on (one row per phone and browser) -------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 100),
  device text not null default '' check (char_length(device) <= 100),
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
drop policy if exists "Owner full access" on public.push_subscriptions;
create policy "Owner full access" on public.push_subscriptions
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- What the dentist wants to hear about, and when to keep quiet ---------------------------------------
create table if not exists public.notification_settings (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  new_request boolean not null default true,
  waiting_request boolean not null default true,
  morning_brief boolean not null default true,
  -- Patient names on the lock screen: off unless he turns them on
  show_names boolean not null default false,
  quiet_from time not null default '21:00',
  quiet_until time not null default '08:00',
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from anon;
drop policy if exists "Owner full access" on public.notification_settings;
create policy "Owner full access" on public.notification_settings
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop trigger if exists notification_settings_set_updated_at on public.notification_settings;
create trigger notification_settings_set_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();

-- Every notification once: written only by the functions below ----------------------------------------
create table if not exists public.notification_log (
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('new_request', 'waiting_request', 'morning_brief')),
  ref text not null check (char_length(ref) <= 100),
  sent_at timestamptz not null default now(),
  primary key (owner_id, kind, ref)
);
alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;

-- The secret the scheduler and the app's notification route share (Supabase Vault, name clinic_os_cron)
create or replace function public.notify_secret_ok(p_secret text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return p_secret is not null and char_length(p_secret) >= 32 and exists (
    select 1 from vault.decrypted_secrets s where s.name = 'clinic_os_cron' and s.decrypted_secret = p_secret);
end;
$$;

-- His settings (the defaults until he saves any) and his phones, as the senders need them
create or replace function public.notify_target(p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings jsonb;
begin
  select jsonb_build_object('new_request', s.new_request, 'waiting_request', s.waiting_request,
           'morning_brief', s.morning_brief, 'show_names', s.show_names,
           'quiet_from', to_char(s.quiet_from, 'HH24:MI'), 'quiet_until', to_char(s.quiet_until, 'HH24:MI'))
    into v_settings
    from public.notification_settings s where s.owner_id = p_owner;
  return jsonb_build_object(
    'settings', coalesce(v_settings, jsonb_build_object('new_request', true, 'waiting_request', true,
      'morning_brief', true, 'show_names', false, 'quiet_from', '21:00', 'quiet_until', '08:00')),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
                               from public.push_subscriptions p where p.owner_id = p_owner), '[]'::jsonb));
end;
$$;

-- A website request just came in: once per request
create or replace function public.notify_new_request(p_secret text, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if not public.notify_secret_ok(p_secret) then
    raise exception 'Not allowed';
  end if;
  select b.owner_id, b.name, b.reason, b.requested_start into r
    from public.booking_requests b where b.id = p_request and b.status = 'new';
  if not found then
    return null;
  end if;
  insert into public.notification_log (owner_id, kind, ref) values (r.owner_id, 'new_request', p_request::text)
    on conflict do nothing;
  if not found then
    return null;
  end if;
  return public.notify_target(r.owner_id) || jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
    'kind', 'new_request', 'ref', p_request, 'name', r.name, 'reason', r.reason, 'starts_at', r.requested_start)));
end;
$$;

-- Every 5 minutes: what is due now, each once. A website request still waiting 30 minutes after it came in
-- (looking back 12 hours), and from 8:15 AM on a day the clinic opens, the morning brief.
create or replace function public.notify_due(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_now timestamptz := public.clinic_now();
  v_local timestamp := public.clinic_now() at time zone 'Asia/Kolkata';
  v_today date := (public.clinic_now() at time zone 'Asia/Kolkata')::date;
  v_items jsonb := '[]'::jsonb;
  r record;
begin
  if not public.notify_secret_ok(p_secret) then
    raise exception 'Not allowed';
  end if;
  select c.clinic_owner_id into v_owner from public.app_config c where c.id;
  if v_owner is null then
    return null;
  end if;

  for r in
    select b.id, b.name, b.reason, b.requested_start, b.created_at
    from public.booking_requests b
    where b.owner_id = v_owner and b.status = 'new' and b.received_at is null
      and b.created_at <= v_now - interval '30 minutes' and b.created_at > v_now - interval '12 hours'
      and not exists (select 1 from public.notification_log l
                      where l.owner_id = v_owner and l.kind = 'waiting_request' and l.ref = b.id::text)
    order by b.created_at
  loop
    insert into public.notification_log (owner_id, kind, ref) values (v_owner, 'waiting_request', r.id::text)
      on conflict do nothing;
    v_items := v_items || jsonb_build_array(jsonb_build_object('kind', 'waiting_request', 'ref', r.id, 'name', r.name,
      'reason', r.reason, 'starts_at', r.requested_start, 'created_at', r.created_at));
  end loop;

  -- Not on a Friday, not when the whole morning is blocked off, and not late (if the scheduler was down)
  if v_local::time >= time '08:15' and v_local::time < time '12:00'
     and extract(isodow from v_today) <> 5
     and not exists (select 1 from public.time_off t
                     where t.owner_id = v_owner
                       and t.starts_at <= (v_today + time '08:30') at time zone 'Asia/Kolkata'
                       and t.ends_at >= (v_today + time '13:00') at time zone 'Asia/Kolkata')
     and not exists (select 1 from public.notification_log l
                     where l.owner_id = v_owner and l.kind = 'morning_brief' and l.ref = v_today::text) then
    insert into public.notification_log (owner_id, kind, ref) values (v_owner, 'morning_brief', v_today::text)
      on conflict do nothing;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'morning_brief', 'ref', v_today,
      'booked', (select count(*) from public.appointments a
                 where a.owner_id = v_owner and a.status = 'booked'
                   and (a.starts_at at time zone 'Asia/Kolkata')::date = v_today),
      'first_at', (select min(a.starts_at) from public.appointments a
                   where a.owner_id = v_owner and a.status = 'booked'
                     and (a.starts_at at time zone 'Asia/Kolkata')::date = v_today),
      'waiting', (select count(*) from public.booking_requests b where b.owner_id = v_owner and b.status = 'new')));
  end if;

  if jsonb_array_length(v_items) = 0 then
    return null;
  end if;
  return public.notify_target(v_owner) || jsonb_build_object('items', v_items);
end;
$$;

-- Phones the push service says are gone (uninstalled, notifications turned off): forget them
create or replace function public.notify_gone(p_secret text, p_endpoints text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.notify_secret_ok(p_secret) then
    raise exception 'Not allowed';
  end if;
  delete from public.push_subscriptions p where p.endpoint = any (p_endpoints);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.notify_secret_ok(text) from public, anon, authenticated;
revoke all on function public.notify_target(uuid) from public, anon, authenticated;
revoke all on function public.notify_new_request(text, uuid) from public;
revoke all on function public.notify_due(text) from public;
revoke all on function public.notify_gone(text, text[]) from public;
grant execute on function public.notify_new_request(text, uuid) to anon, authenticated;
grant execute on function public.notify_due(text) to anon, authenticated;
grant execute on function public.notify_gone(text, text[]) to anon, authenticated;

notify pgrst, 'reload schema';

-- Stock and costs (21 Oct 2026, build step P4; supabase/stock-costs-2026-10.sql). Additive: six tables, one view, one trigger, a private folder for
-- bill photos, and the morning brief learns about low stock.
--
-- What the clinic keeps (stock_items), what comes in and goes out (stock_moves: a bill in, a use, a count
-- correction, waste), what one treatment uses (treatment_materials: adding that charge to a visit takes
-- the materials off stock, and removing the charge puts them back), and what the clinic spends (costs),
-- with its regular bills (fixed_costs). Only the dentist's own account can see or change any of it.

-- Regular bills: rent, electricity, internet, software, equipment payments ---------------------------
create table if not exists public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  category text not null default 'other'
    check (category in ('stock', 'lab', 'rent', 'electricity', 'internet_phone', 'software', 'equipment', 'repairs', 'salary', 'other')),
  amount numeric(12,2) not null check (amount > 0),
  every text not null default 'month' check (every in ('month', 'year')),
  starts_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

-- Money spent: a bill, a lab fee, a repair, or a regular bill marked paid -----------------------------
create table if not exists public.costs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spent_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  category text not null
    check (category in ('stock', 'lab', 'rent', 'electricity', 'internet_phone', 'software', 'equipment', 'repairs', 'salary', 'other')),
  amount numeric(12,2) not null check (amount > 0),
  paid_by text not null default 'cash' check (paid_by in ('cash', 'upi', 'bank', 'card')),
  payee text not null default '' check (char_length(payee) <= 100),
  note text not null default '' check (char_length(note) <= 300),
  -- A photo of the bill in the private cost-bills folder ("<owner id>/<cost id>.<ext>")
  bill_path text check (char_length(bill_path) <= 300),
  -- A lab fee can belong to a patient's visit (a crown, a denture)
  visit_id uuid references public.visits (id) on delete set null,
  fixed_cost_id uuid references public.fixed_costs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists costs_owner_spent_idx on public.costs (owner_id, spent_on desc);
-- A regular bill is marked paid once a month (or a year): never twice for the same period
create unique index if not exists costs_fixed_once_per_period on public.costs (fixed_cost_id, (date_trunc('month', spent_on::timestamp)))
  where fixed_cost_id is not null;

-- What the clinic keeps --------------------------------------------------------------------------------
create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  category text not null default 'consumable' check (category in ('consumable', 'medicine', 'material', 'instrument', 'other')),
  unit text not null default 'piece' check (char_length(unit) between 1 and 20),
  -- At or below this much, it shows as low (0: never)
  low_level numeric(12,2) not null default 0 check (low_level >= 0),
  supplier text not null default '' check (char_length(supplier) <= 100),
  last_unit_cost numeric(12,2) check (last_unit_cost >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists stock_items_owner_name on public.stock_items (owner_id, lower(name)) where not archived;

-- In and out: a bill in (+), a use or waste (-), a count correction (either way) -----------------------
create table if not exists public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.stock_items (id) on delete cascade,
  kind text not null check (kind in ('in', 'use', 'count', 'waste')),
  qty numeric(12,2) not null check (qty <> 0),
  unit_cost numeric(12,2) check (unit_cost >= 0),
  expires_on date,
  -- Used for this charge on a visit: removing the charge removes the use, so the stock comes back
  charge_id uuid references public.visit_charges (id) on delete cascade,
  -- The bill it came in on
  cost_id uuid references public.costs (id) on delete set null,
  note text not null default '' check (char_length(note) <= 200),
  moved_at timestamptz not null default now(),
  check ((kind = 'in' and qty > 0) or (kind in ('use', 'waste') and qty < 0) or kind = 'count')
);
create index if not exists stock_moves_item_idx on public.stock_moves (item_id, moved_at desc);
create index if not exists stock_moves_charge_idx on public.stock_moves (charge_id) where charge_id is not null;

-- What one treatment uses: the price-list option as a charge names it ("Fillings – 3M Z350 Composite") --
create table if not exists public.treatment_materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  treatment_slug text not null check (char_length(treatment_slug) between 1 and 100),
  charge_description text not null check (char_length(charge_description) between 1 and 200),
  item_id uuid not null references public.stock_items (id) on delete cascade,
  qty numeric(12,2) not null check (qty > 0),
  unique (owner_id, treatment_slug, charge_description, item_id)
);

-- On hand for each item, and the soonest expiry still to come among what came in ----------------------
create or replace view public.stock_levels with (security_invoker = true) as
  select i.id as item_id, i.name, i.category, i.unit, i.low_level, i.supplier, i.last_unit_cost, i.archived,
    coalesce((select sum(m.qty) from public.stock_moves m where m.item_id = i.id), 0)::numeric(12,2) as on_hand,
    (select min(m.expires_on) from public.stock_moves m
      where m.item_id = i.id and m.kind = 'in' and m.expires_on >= (now() at time zone 'Asia/Kolkata')::date) as next_expiry
  from public.stock_items i;

-- A charge from the price list takes its materials off stock (as the dentist: the same rules apply) ----
create or replace function public.use_materials_for_charge()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.treatment_slug is not null then
    insert into public.stock_moves (owner_id, item_id, kind, qty, charge_id, note)
    select new.owner_id, tm.item_id, 'use', -tm.qty, new.id, left(new.description, 200)
    from public.treatment_materials tm
    where tm.owner_id = new.owner_id and tm.treatment_slug = new.treatment_slug and tm.charge_description = new.description;
  end if;
  return new;
end;
$$;

drop trigger if exists visit_charges_use_materials on public.visit_charges;
create trigger visit_charges_use_materials
  after insert on public.visit_charges
  for each row execute function public.use_materials_for_charge();

drop trigger if exists fixed_costs_set_updated_at on public.fixed_costs;
create trigger fixed_costs_set_updated_at before update on public.fixed_costs for each row execute function public.set_updated_at();
drop trigger if exists costs_set_updated_at on public.costs;
create trigger costs_set_updated_at before update on public.costs for each row execute function public.set_updated_at();
drop trigger if exists stock_items_set_updated_at on public.stock_items;
create trigger stock_items_set_updated_at before update on public.stock_items for each row execute function public.set_updated_at();

-- Only the dentist's own account ---------------------------------------------------------------------
alter table public.fixed_costs enable row level security;
alter table public.costs enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_moves enable row level security;
alter table public.treatment_materials enable row level security;
revoke all on public.fixed_costs, public.costs, public.stock_items, public.stock_moves, public.treatment_materials, public.stock_levels from anon;

drop policy if exists "Owner full access" on public.fixed_costs;
create policy "Owner full access" on public.fixed_costs for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "Owner full access" on public.costs;
create policy "Owner full access" on public.costs for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "Owner full access" on public.stock_items;
create policy "Owner full access" on public.stock_items for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- A move must be for one of the dentist's own items (and charges)
drop policy if exists "Owner full access" on public.stock_moves;
create policy "Owner full access" on public.stock_moves for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.stock_items i where i.id = item_id and i.owner_id = (select auth.uid())));
drop policy if exists "Owner full access" on public.treatment_materials;
create policy "Owner full access" on public.treatment_materials for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.stock_items i where i.id = item_id and i.owner_id = (select auth.uid())));

-- Bill photos: a private folder, each account its own sub-folder ------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cost-bills', 'cost-bills', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owner reads own bills" on storage.objects;
create policy "Owner reads own bills" on storage.objects for select to authenticated
  using (bucket_id = 'cost-bills' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owner uploads own bills" on storage.objects;
create policy "Owner uploads own bills" on storage.objects for insert to authenticated
  with check (bucket_id = 'cost-bills' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owner deletes own bills" on storage.objects;
create policy "Owner deletes own bills" on storage.objects for delete to authenticated
  using (bucket_id = 'cost-bills' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The morning brief also says what is low on stock (the same as before, plus "low") -------------------
create or replace function public.notify_due(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_now timestamptz := public.clinic_now();
  v_local timestamp := public.clinic_now() at time zone 'Asia/Kolkata';
  v_today date := (public.clinic_now() at time zone 'Asia/Kolkata')::date;
  v_items jsonb := '[]'::jsonb;
  r record;
begin
  if not public.notify_secret_ok(p_secret) then
    raise exception 'Not allowed';
  end if;
  select c.clinic_owner_id into v_owner from public.app_config c where c.id;
  if v_owner is null then
    return null;
  end if;

  for r in
    select b.id, b.name, b.reason, b.requested_start, b.created_at
    from public.booking_requests b
    where b.owner_id = v_owner and b.status = 'new' and b.received_at is null
      and b.created_at <= v_now - interval '30 minutes' and b.created_at > v_now - interval '12 hours'
      and not exists (select 1 from public.notification_log l
                      where l.owner_id = v_owner and l.kind = 'waiting_request' and l.ref = b.id::text)
    order by b.created_at
  loop
    insert into public.notification_log (owner_id, kind, ref) values (v_owner, 'waiting_request', r.id::text)
      on conflict do nothing;
    v_items := v_items || jsonb_build_array(jsonb_build_object('kind', 'waiting_request', 'ref', r.id, 'name', r.name,
      'reason', r.reason, 'starts_at', r.requested_start, 'created_at', r.created_at));
  end loop;

  if v_local::time >= time '08:15' and v_local::time < time '12:00'
     and extract(isodow from v_today) <> 5
     and not exists (select 1 from public.time_off t
                     where t.owner_id = v_owner
                       and t.starts_at <= (v_today + time '08:30') at time zone 'Asia/Kolkata'
                       and t.ends_at >= (v_today + time '13:00') at time zone 'Asia/Kolkata')
     and not exists (select 1 from public.notification_log l
                     where l.owner_id = v_owner and l.kind = 'morning_brief' and l.ref = v_today::text) then
    insert into public.notification_log (owner_id, kind, ref) values (v_owner, 'morning_brief', v_today::text)
      on conflict do nothing;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'morning_brief', 'ref', v_today,
      'booked', (select count(*) from public.appointments a
                 where a.owner_id = v_owner and a.status = 'booked'
                   and (a.starts_at at time zone 'Asia/Kolkata')::date = v_today),
      'first_at', (select min(a.starts_at) from public.appointments a
                   where a.owner_id = v_owner and a.status = 'booked'
                     and (a.starts_at at time zone 'Asia/Kolkata')::date = v_today),
      'waiting', (select count(*) from public.booking_requests b where b.owner_id = v_owner and b.status = 'new'),
      -- What is at or below its low level, lowest first (at most five names)
      'low', coalesce((select jsonb_agg(low.name order by low.share)
                       from (select s.name, s.on_hand / s.low_level as share
                             from (select i.name, i.low_level,
                                          coalesce((select sum(m.qty) from public.stock_moves m where m.item_id = i.id), 0) as on_hand
                                   from public.stock_items i
                                   where i.owner_id = v_owner and not i.archived and i.low_level > 0) s
                             where s.on_hand <= s.low_level
                             order by s.on_hand / s.low_level
                             limit 5) low), '[]'::jsonb)));
  end if;

  if jsonb_array_length(v_items) = 0 then
    return null;
  end if;
  return public.notify_target(v_owner) || jsonb_build_object('items', v_items);
end;
$$;

revoke all on function public.notify_due(text) from public;
grant execute on function public.notify_due(text) to anon, authenticated;


-- Error alerts, the access log, consent, message language, the nightly tidy-up (records-2026-10.sql) -----
-- What went wrong on a Clinic OS screen: the error, the screen, the device; never anything about a
-- patient. The daily health check emails the owner when there were any (.github/workflows/health.yml).
create table if not exists public.app_errors (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  place text not null check (char_length(place) <= 300),
  message text not null check (char_length(message) <= 1000),
  stack text check (char_length(stack) <= 4000),
  device text check (char_length(device) <= 100)
);
create index if not exists app_errors_owner_at_idx on public.app_errors (owner_id, at desc);
alter table public.app_errors enable row level security;
drop policy if exists "Owner full access" on public.app_errors;
create policy "Owner full access" on public.app_errors
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Each sign-in and each patient record opened, with the device: the DPDP Rules ask for logs that show
-- who accessed personal data, kept for a year. The app can add and read them, never change or delete
-- them; the nightly tidy-up deletes those older than a year.
create table if not exists public.access_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  action text not null check (action in ('signed in', 'opened patient', 'opened visit')),
  patient_id uuid references public.patients (id) on delete set null,
  visit_id uuid references public.visits (id) on delete set null,
  device text check (char_length(device) <= 100)
);
create index if not exists access_log_owner_at_idx on public.access_log (owner_id, at desc);
alter table public.access_log enable row level security;
drop policy if exists "Owner reads" on public.access_log;
create policy "Owner reads" on public.access_log
  for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists "Owner adds" on public.access_log;
create policy "Owner adds" on public.access_log
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- When the patient agreed to the clinic keeping their records (asked at the first visit); empty when
-- not asked yet, or withdrawn
alter table public.patients add column if not exists consent_at timestamptz;

-- The language of the patient's WhatsApp messages: Kannada ('kn'); empty for English
alter table public.patients add column if not exists language text check (language in ('kn'));

-- The nightly tidy-up, run by the backup job once the night's backup is safe (.github/workflows/backup.yml):
-- the access log after a year, error reports after 90 days, and website requests that never became a
-- booking after six months. Returns the voice notes of the requests it deleted, for the job to delete
-- from storage.
create or replace function public.tidy_old_records()
returns setof text
language sql
security definer
set search_path = ''
as $$
  delete from public.access_log where at < now() - interval '1 year';
  delete from public.app_errors where at < now() - interval '90 days';
  delete from public.share_links where expires_at < now() - interval '30 days';
  delete from public.booking_requests
  where status <> 'booked' and created_at < now() - interval '6 months'
  returning voice_note;
$$;
revoke all on function public.tidy_old_records() from public, anon, authenticated;

-- The short prescription link (share-links-2026-10.sql) ---------------------
-- What a link shows: each ticked photo's name and its 30-day file link, made when the message is made
alter table public.share_links add column if not exists photos jsonb not null default '[]'::jsonb
  check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 10);

-- A link's page (/r/<code>): the visit's date, the patient's first name and message language, and the
-- photos, while the link is current; {"expired": true} once it has run out; nothing for a code that isn't
-- one. Anyone may call it: the code (32 random characters) is the key.
create or replace function public.shared_photos(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.expires_at > now()
    then jsonb_build_object(
      'visit_date', v.visit_date,
      'first_name', split_part(btrim(p.name), ' ', 1),
      'language', p.language,
      'expires_at', s.expires_at,
      'photos', s.photos)
    else jsonb_build_object('expired', true)
  end
  from public.share_links s
  join public.visits v on v.id = s.visit_id
  join public.patients p on p.id = v.patient_id
  where char_length(p_token) between 32 and 128 and s.token = p_token
$$;
revoke all on function public.shared_photos(text) from public, anon, authenticated;
grant execute on function public.shared_photos(text) to anon, authenticated;

-- Discounts (discounts-2026-10.sql): a bill line of its own kind whose amount is below zero, so every
-- total and due takes it off; every other line is zero or more
alter table public.visit_charges drop constraint if exists visit_charges_kind_check;
alter table public.visit_charges add constraint visit_charges_kind_check
  check (kind in ('item', 'extra', 'discount'));
alter table public.visit_charges drop constraint if exists visit_charges_amount_check;
alter table public.visit_charges add constraint visit_charges_amount_check
  check (case when kind = 'discount' then amount < 0 else amount >= 0 end);

notify pgrst, 'reload schema';

-- The clinic's price list (25 Oct 2026 supabase/price-list-2026-10.sql): one row per priced option; the website
-- reads it with public_price_list(), the stock spreadsheet's Treatments sheet replaces it with replace_price_list().

create table if not exists public.price_list (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  line_no integer not null check (line_no between 1 and 500),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  treatment text not null check (char_length(treatment) between 1 and 100),
  description text not null default '' check (char_length(description) <= 300),
  detail text not null default '' check (char_length(detail) <= 120),
  cost text not null check (char_length(cost) between 1 and 80),
  updated_at timestamptz not null default now(),
  unique (owner_id, treatment, detail)
);

alter table public.price_list enable row level security;

drop policy if exists "Owner full access" on public.price_list;
create policy "Owner full access" on public.price_list
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.price_list from anon;
grant select, insert, update, delete on public.price_list to authenticated;

-- The clinic's list, for the website and Clinic OS alike: anyone may read it
create or replace function public.public_price_list()
returns table (line_no integer, slug text, treatment text, description text, detail text, cost text)
language sql stable security definer set search_path = ''
as $$
  select p.line_no, p.slug, p.treatment, p.description, p.detail, p.cost
  from public.price_list p
  join public.app_config c on c.id and p.owner_id = c.clinic_owner_id
  order by p.line_no
$$;

revoke all on function public.public_price_list() from public;
grant execute on function public.public_price_list() to anon, authenticated;

-- Loading the sheet: the doctor's whole list replaced at once, or not at all
create or replace function public.replace_price_list(p_items jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'A price list has 1 to 500 lines';
  end if;
  delete from public.price_list where owner_id = (select auth.uid());
  insert into public.price_list (owner_id, line_no, slug, treatment, description, detail, cost)
  select (select auth.uid()), i.ord::integer, i.item->>'slug', i.item->>'treatment',
         coalesce(i.item->>'description', ''), coalesce(i.item->>'detail', ''), i.item->>'cost'
  from jsonb_array_elements(p_items) with ordinality as i(item, ord);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_price_list(jsonb) from public, anon;
grant execute on function public.replace_price_list(jsonb) to authenticated;

-- Multi-clinic, slice 1 (30 Oct 2026, supabase/multi-clinic-1-2026-10.sql): clinics and their members; a clinic on every
-- clinic-data row, filled from the row's owner. Access is still per login (slice 2 switches it).

-- Clinics, and who works at each ----------------------------------------------------------------------
create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  -- Public and stable: the website's booking will name its clinic by this
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.clinic_members (
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'dentist', 'assistant')),
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index if not exists clinic_members_user_idx on public.clinic_members (user_id);

-- The clinic the signed-in person works in (the first they joined), or null
create or replace function public.my_clinic_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.clinic_id from public.clinic_members m
  where m.user_id = (select auth.uid())
  order by m.created_at, m.clinic_id
  limit 1
$$;

create or replace function public.is_clinic_member(p_clinic uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.clinic_members m where m.clinic_id = p_clinic and m.user_id = (select auth.uid()))
$$;

revoke all on function public.my_clinic_id() from public, anon;
revoke all on function public.is_clinic_member(uuid) from public, anon;
grant execute on function public.my_clinic_id() to authenticated;
grant execute on function public.is_clinic_member(uuid) to authenticated;

-- Members read their clinic and its members; clinics and members are set up by the operator, not the app
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
drop policy if exists "Members read their clinic" on public.clinics;
create policy "Members read their clinic" on public.clinics
  for select to authenticated
  using (public.is_clinic_member(id));
drop policy if exists "Members read their clinic's members" on public.clinic_members;
create policy "Members read their clinic's members" on public.clinic_members
  for select to authenticated
  using (public.is_clinic_member(clinic_id));
revoke all on public.clinics, public.clinic_members from anon, authenticated;
grant select on public.clinics, public.clinic_members to authenticated;

-- Every login without a clinic becomes the owner of one of its own. The clinic in app_config (the one the
-- website books into) is Smile Dental Clinic; any other is a new clinic, named later in its settings.
with owners as materialized (
  select u.id as user_id,
         gen_random_uuid() as clinic_id,
         (u.id = cfg.owner_id) as is_main
  from auth.users u
  left join (select c.clinic_owner_id as owner_id from public.app_config c where c.id) cfg on true
  where not exists (select 1 from public.clinic_members m where m.user_id = u.id)
), made as (
  insert into public.clinics (id, slug, name)
  select o.clinic_id,
         case when o.is_main and not exists (select 1 from public.clinics c where c.slug = 'smile-dental-katapadi')
              then 'smile-dental-katapadi' else 'clinic-' || left(replace(o.clinic_id::text, '-', ''), 12) end,
         case when o.is_main then 'Smile Dental Clinic' else 'New clinic' end
  from owners o
  returning id
)
insert into public.clinic_members (clinic_id, user_id, role)
select o.clinic_id, o.user_id, 'owner' from owners o;

-- A new row's clinic: its owner's (the clinic they work in), unless the row names one
create or replace function public.fill_clinic_id()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.clinic_id is null then
    select m.clinic_id into new.clinic_id
    from public.clinic_members m
    where m.user_id = new.owner_id
    order by m.created_at, m.clinic_id
    limit 1;
  end if;
  return new;
end;
$$;

-- A clinic on every clinic-data row ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'patients', 'visits', 'visit_photos', 'visit_charges', 'payments', 'share_links', 'appointments',
    'time_off', 'booking_requests', 'visit_recordings', 'tally_settings', 'fixed_costs', 'costs',
    'stock_items', 'stock_moves', 'treatment_materials', 'price_list'
  ] loop
    -- A clinic with records cannot be deleted by mistake: its records have to be removed first, on purpose
    execute format('alter table public.%I add column if not exists clinic_id uuid references public.clinics (id) on delete restrict', t);
    execute format('create index if not exists %I on public.%I (clinic_id)', t || '_clinic_idx', t);
    -- Existing rows: their owner's clinic, with the table's own triggers off (a fill is not a change to a
    -- bill, an appointment or the row's updated_at)
    execute format('alter table public.%I disable trigger user', t);
    execute format(
      'update public.%I x set clinic_id = m.clinic_id
       from (select distinct on (user_id) user_id, clinic_id from public.clinic_members order by user_id, created_at, clinic_id) m
       where x.clinic_id is null and x.owner_id = m.user_id', t);
    execute format('alter table public.%I enable trigger user', t);
    -- New rows: filled from their owner, whoever inserts them
    execute format('create or replace trigger %I before insert on public.%I for each row execute function public.fill_clinic_id()', t || '_fill_clinic', t);
  end loop;
end;
$$;

-- Multi-clinic, slice 2a (30 Oct 2026, supabase/multi-clinic-2-2026-10.sql): access by clinic. Members read and write
-- their clinic's rows and files; a new row is its maker's; records outlive their maker; the clinic is filled in
-- first; appointments are in a chair with a dentist, one at a time each. The website's public functions and the
-- notifications still go through app_config's login (slice 4).

-- The clinic's own folder, or a member's: is this folder one of the signed-in person's clinic? -------------
create or replace function public.is_clinic_folder(p_folder text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_folder = (select public.my_clinic_id())::text
      or exists (select 1 from public.clinic_members m
                 where m.clinic_id = (select public.my_clinic_id()) and m.user_id::text = p_folder)
$$;

revoke all on function public.is_clinic_folder(text) from public, anon;
grant execute on function public.is_clinic_folder(text) to authenticated;

-- Every clinic table: a clinic required, records outlive their maker, the clinic filled in first, and a new
-- row is its maker's ---------------------------------------------------------------------------------------
do $$
declare
  t text;
  c record;
begin
  foreach t in array array[
    'patients', 'visits', 'visit_photos', 'visit_charges', 'payments', 'share_links', 'appointments',
    'time_off', 'booking_requests', 'visit_recordings', 'tally_settings', 'fixed_costs', 'costs',
    'stock_items', 'stock_moves', 'treatment_materials', 'price_list'
  ] loop
    execute format('alter table public.%I alter column clinic_id set not null', t);
    -- Deleting a login with records is refused (it deleted them before)
    for c in select k.conname from pg_constraint k
             where k.conrelid = format('public.%I', t)::regclass and k.contype = 'f'
               and k.confrelid = 'auth.users'::regclass and k.confdeltype <> 'r' loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    if not exists (select 1 from pg_constraint k where k.conrelid = format('public.%I', t)::regclass
                   and k.contype = 'f' and k.confrelid = 'auth.users'::regclass) then
      execute format('alter table public.%I add constraint %I foreign key (owner_id) references auth.users (id) on delete restrict', t, t || '_owner_id_fkey');
    end if;
    -- A table's triggers fire in name order, and "0" comes before any letter
    execute format('drop trigger if exists %I on public.%I', t || '_fill_clinic', t);
    execute format('create or replace trigger "0_fill_clinic" before insert on public.%I for each row execute function public.fill_clinic_id()', t);
    execute format('drop policy if exists "New rows are their maker''s" on public.%I', t);
    execute format('create policy "New rows are their maker''s" on public.%I as restrictive for insert to authenticated with check (owner_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Who reads and writes the clinic's rows: its members --------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['patients', 'time_off', 'tally_settings', 'fixed_costs', 'costs', 'stock_items', 'price_list'] loop
    execute format('drop policy if exists "Owner full access" on public.%I', t);
    execute format('drop policy if exists "Clinic members" on public.%I', t);
    execute format('create policy "Clinic members" on public.%I for all to authenticated using (clinic_id = (select public.my_clinic_id())) with check (clinic_id = (select public.my_clinic_id()))', t);
  end loop;
end;
$$;

-- What a row points at is in the same clinic: a visit's patient, a photo's or a charge's visit (and the
-- visit's patient), a move's item...
drop policy if exists "Owner full access" on public.visits;
drop policy if exists "Clinic members" on public.visits;
create policy "Clinic members" on public.visits
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.patients p where p.id = visits.patient_id and p.clinic_id = visits.clinic_id)
  );

-- A photo's file is in its visit's folder, under the clinic's folder or a member's
drop policy if exists "Owner full access" on public.visit_photos;
drop policy if exists "Clinic members" on public.visit_photos;
create policy "Clinic members" on public.visit_photos
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.visits v where v.id = visit_photos.visit_id and v.clinic_id = visit_photos.clinic_id)
    and split_part(visit_photos.storage_path, '/', 2) = visit_photos.visit_id::text
    and split_part(visit_photos.storage_path, '/', 3) <> ''
    and public.is_clinic_folder(split_part(visit_photos.storage_path, '/', 1))
  );

drop policy if exists "Owner full access" on public.visit_charges;
drop policy if exists "Clinic members" on public.visit_charges;
create policy "Clinic members" on public.visit_charges
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.visits v
                where v.id = visit_charges.visit_id and v.clinic_id = visit_charges.clinic_id
                  and v.patient_id = visit_charges.patient_id)
  );

drop policy if exists "Owner full access" on public.payments;
drop policy if exists "Clinic members" on public.payments;
create policy "Clinic members" on public.payments
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.visits v
                where v.id = payments.visit_id and v.clinic_id = payments.clinic_id
                  and v.patient_id = payments.patient_id)
  );

drop policy if exists "Owner full access" on public.share_links;
drop policy if exists "Clinic members" on public.share_links;
create policy "Clinic members" on public.share_links
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.visits v where v.id = share_links.visit_id and v.clinic_id = share_links.clinic_id)
  );

drop policy if exists "Owner full access" on public.appointments;
drop policy if exists "Clinic members" on public.appointments;
create policy "Clinic members" on public.appointments
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.patients p where p.id = appointments.patient_id and p.clinic_id = appointments.clinic_id)
    and (appointments.from_visit_id is null or exists (
          select 1 from public.visits v
          where v.id = appointments.from_visit_id and v.clinic_id = appointments.clinic_id
            and v.patient_id = appointments.patient_id))
    and (appointments.visit_id is null or exists (
          select 1 from public.visits v
          where v.id = appointments.visit_id and v.clinic_id = appointments.clinic_id
            and v.patient_id = appointments.patient_id))
  );

drop policy if exists "Owner full access" on public.booking_requests;
drop policy if exists "Clinic members" on public.booking_requests;
create policy "Clinic members" on public.booking_requests
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and (booking_requests.patient_id is null or exists (
          select 1 from public.patients p
          where p.id = booking_requests.patient_id and p.clinic_id = booking_requests.clinic_id))
    and (booking_requests.appointment_id is null or exists (
          select 1 from public.appointments a
          where a.id = booking_requests.appointment_id and a.clinic_id = booking_requests.clinic_id))
  );

drop policy if exists "Owner full access" on public.visit_recordings;
drop policy if exists "Clinic members" on public.visit_recordings;
create policy "Clinic members" on public.visit_recordings
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.visits v where v.id = visit_recordings.visit_id and v.clinic_id = visit_recordings.clinic_id)
    and split_part(visit_recordings.storage_path, '/', 2) = visit_recordings.visit_id::text
    and split_part(visit_recordings.storage_path, '/', 3) <> ''
    and public.is_clinic_folder(split_part(visit_recordings.storage_path, '/', 1))
  );

drop policy if exists "Owner full access" on public.stock_moves;
drop policy if exists "Clinic members" on public.stock_moves;
create policy "Clinic members" on public.stock_moves
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.stock_items i where i.id = stock_moves.item_id and i.clinic_id = stock_moves.clinic_id)
  );

drop policy if exists "Owner full access" on public.treatment_materials;
drop policy if exists "Clinic members" on public.treatment_materials;
create policy "Clinic members" on public.treatment_materials
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.stock_items i where i.id = treatment_materials.item_id and i.clinic_id = treatment_materials.clinic_id)
  );

-- The clinic's files: read and delete in the clinic's folder or a member's; upload to the clinic's or one's own --
do $$
declare
  b record;
begin
  for b in select * from (values
    ('visit-photos', 'visit photos', 'Owner reads own visit photos', 'Owner uploads own visit photos', 'Owner deletes own visit photos'),
    ('visit-audio', 'visit recordings', 'Owner plays own visit recordings', 'Owner uploads own visit recordings', 'Owner deletes own visit recordings'),
    ('cost-bills', 'bills', 'Owner reads own bills', 'Owner uploads own bills', 'Owner deletes own bills')
  ) v(bucket, what, old_read, old_upload, old_delete) loop
    execute format('drop policy if exists %I on storage.objects', b.old_read);
    execute format('drop policy if exists %I on storage.objects', b.old_upload);
    execute format('drop policy if exists %I on storage.objects', b.old_delete);
    execute format('drop policy if exists %I on storage.objects', 'Clinic reads its ' || b.what);
    execute format('drop policy if exists %I on storage.objects', 'Clinic uploads ' || b.what);
    execute format('drop policy if exists %I on storage.objects', 'Clinic deletes its ' || b.what);
    execute format('create policy %I on storage.objects for select to authenticated using (bucket_id = %L and public.is_clinic_folder((storage.foldername(name))[1]))',
                   'Clinic reads its ' || b.what, b.bucket);
    execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and (storage.foldername(name))[1] in ((select public.my_clinic_id())::text, (select auth.uid())::text))',
                   'Clinic uploads ' || b.what, b.bucket);
    execute format('create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and public.is_clinic_folder((storage.foldername(name))[1]))',
                   'Clinic deletes its ' || b.what, b.bucket);
  end loop;
end;
$$;

-- A website request's voice note: the request's clinic plays and deletes it
drop policy if exists "Owner plays request voice notes" on storage.objects;
drop policy if exists "Clinic plays request voice notes" on storage.objects;
create policy "Clinic plays request voice notes" on storage.objects
  for select to authenticated
  using (bucket_id = 'request-voice' and exists (
    select 1 from public.booking_requests b
    where b.id::text = split_part(storage.objects.name, '.', 1) and b.clinic_id = (select public.my_clinic_id())));

drop policy if exists "Owner deletes request voice notes" on storage.objects;
drop policy if exists "Clinic deletes request voice notes" on storage.objects;
create policy "Clinic deletes request voice notes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'request-voice' and exists (
    select 1 from public.booking_requests b
    where b.id::text = split_part(storage.objects.name, '.', 1) and b.clinic_id = (select public.my_clinic_id())));

-- The clinic's chairs and dentists -----------------------------------------------------------------------------
-- A dentist needs no login (a visiting specialist); one with a login is linked to it. One that no longer comes,
-- or a chair out of use, is made inactive rather than deleted: appointments keep pointing at them. Set up by the
-- operator for now (the clinic's settings will list them).
create table if not exists public.chairs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, clinic_id)
);

create table if not exists public.dentists (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  user_id uuid references auth.users (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, clinic_id)
);
create unique index if not exists dentists_one_per_login on public.dentists (clinic_id, user_id) where user_id is not null;

alter table public.chairs enable row level security;
alter table public.dentists enable row level security;
drop policy if exists "Members read their clinic's chairs" on public.chairs;
create policy "Members read their clinic's chairs" on public.chairs
  for select to authenticated
  using (clinic_id = (select public.my_clinic_id()));
drop policy if exists "Members read their clinic's dentists" on public.dentists;
create policy "Members read their clinic's dentists" on public.dentists
  for select to authenticated
  using (clinic_id = (select public.my_clinic_id()));
revoke all on public.chairs, public.dentists from anon, authenticated;
grant select on public.chairs, public.dentists to authenticated;

-- Every clinic starts with Chair 1 and its owner as its dentist (Smile Dental Clinic's: Dr. Rahil Yusuf)
insert into public.chairs (clinic_id, name)
select c.id, 'Chair 1' from public.clinics c
where not exists (select 1 from public.chairs h where h.clinic_id = c.id);

insert into public.dentists (clinic_id, name, user_id)
select m.clinic_id, case when m.user_id = cfg.owner_id then 'Dr. Rahil Yusuf' else 'Dentist' end, m.user_id
from public.clinic_members m
left join (select a.clinic_owner_id as owner_id from public.app_config a where a.id) cfg on true
where m.role = 'owner'
  and not exists (select 1 from public.dentists d where d.clinic_id = m.clinic_id);

-- An appointment's chair and dentist (time off may be one dentist's; without one, it is the whole clinic's).
-- Existing appointments get the clinic's chair and dentist with the table's own triggers off (no new
-- updated_at, no re-check of an old time).
alter table public.appointments add column if not exists chair_id uuid;
alter table public.appointments add column if not exists dentist_id uuid;
alter table public.time_off add column if not exists dentist_id uuid;

alter table public.appointments disable trigger user;
update public.appointments a
set chair_id = coalesce(a.chair_id, (select c.id from public.chairs c where c.clinic_id = a.clinic_id order by c.created_at, c.id limit 1)),
    dentist_id = coalesce(a.dentist_id, (select d.id from public.dentists d where d.clinic_id = a.clinic_id
                                         order by (d.user_id is not distinct from a.owner_id) desc, d.created_at, d.id limit 1))
where a.chair_id is null or a.dentist_id is null;
alter table public.appointments enable trigger user;

alter table public.appointments alter column chair_id set not null;
alter table public.appointments alter column dentist_id set not null;
create index if not exists appointments_chair_idx on public.appointments (chair_id);
create index if not exists appointments_dentist_idx on public.appointments (dentist_id);
create index if not exists time_off_dentist_idx on public.time_off (dentist_id);

-- The chair and the dentist are the appointment's clinic's (whoever writes it)
do $$
begin
  alter table public.appointments add constraint appointments_chair_in_clinic
    foreign key (chair_id, clinic_id) references public.chairs (id, clinic_id);
exception when duplicate_object then null;
end;
$$;
do $$
begin
  alter table public.appointments add constraint appointments_dentist_in_clinic
    foreign key (dentist_id, clinic_id) references public.dentists (id, clinic_id);
exception when duplicate_object then null;
end;
$$;
do $$
begin
  alter table public.time_off add constraint time_off_dentist_in_clinic
    foreign key (dentist_id, clinic_id) references public.dentists (id, clinic_id);
exception when duplicate_object then null;
end;
$$;

-- A chair holds one booked appointment at a time, and so does a dentist (this was one per login)
alter table public.appointments drop constraint if exists appointments_no_overlap;
do $$
begin
  alter table public.appointments
    add constraint appointments_chair_free
    exclude using gist (
      chair_id with =,
      tstzrange(starts_at, public.appointment_end(starts_at, duration_min)) with &&
    ) where (status = 'booked');
exception when duplicate_object or duplicate_table then null;
end;
$$;
do $$
begin
  alter table public.appointments
    add constraint appointments_dentist_free
    exclude using gist (
      dentist_id with =,
      tstzrange(starts_at, public.appointment_end(starts_at, duration_min)) with &&
    ) where (status = 'booked');
exception when duplicate_object or duplicate_table then null;
end;
$$;
-- …and a patient is in one chair at a time
do $$
begin
  alter table public.appointments
    add constraint appointments_patient_free
    exclude using gist (
      patient_id with =,
      tstzrange(starts_at, public.appointment_end(starts_at, duration_min)) with &&
    ) where (status = 'booked');
exception when duplicate_object or duplicate_table then null;
end;
$$;

-- An appointment that names no dentist gets the booking person's (else the clinic's first); one that names no
-- chair gets the first chair free at its time (else the first, and the rule above refuses the taken time).
-- Moved to a time when its chair is taken, it changes to a free one.
create or replace function public.fill_appointment_place()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_range tstzrange := tstzrange(new.starts_at, public.appointment_end(new.starts_at, new.duration_min));
begin
  if new.dentist_id is null then
    select d.id into new.dentist_id from public.dentists d
    where d.clinic_id = new.clinic_id and d.active
    order by (d.user_id is not distinct from new.owner_id) desc, d.created_at, d.id
    limit 1;
  end if;
  if new.chair_id is null
     or (tg_op = 'UPDATE' and new.status = 'booked' and new.chair_id is not distinct from old.chair_id
         and exists (select 1 from public.appointments a
                     where a.chair_id = new.chair_id and a.id <> new.id and a.status = 'booked'
                       and tstzrange(a.starts_at, public.appointment_end(a.starts_at, a.duration_min)) && v_range)) then
    select c.id into new.chair_id from public.chairs c
    where c.clinic_id = new.clinic_id and c.active
    order by exists (select 1 from public.appointments a
                     where a.chair_id = c.id and a.id is distinct from new.id and a.status = 'booked'
                       and tstzrange(a.starts_at, public.appointment_end(a.starts_at, a.duration_min)) && v_range),
             c.created_at, c.id
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.fill_appointment_place() from public, anon, authenticated;

-- After the clinic is filled in ("0_…") and before the time check ("appointments_…"): triggers fire in name order
create or replace trigger "1_fill_chair_and_dentist"
  before insert or update of starts_at, duration_min, status, chair_id on public.appointments
  for each row execute function public.fill_appointment_place();

-- An appointment can't be in the clinic's time off, or its dentist's (its clinic and dentist are filled in
-- before this runs)
create or replace function public.check_appointment_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'booked' and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at
                                or new.duration_min is distinct from old.duration_min) then
    if public.appointment_end(new.starts_at, new.duration_min) <= public.clinic_now() then
      raise exception 'That time has already passed.';
    end if;
    if exists (select 1 from public.time_off t
               where t.clinic_id = new.clinic_id
                 and (t.dentist_id is null or t.dentist_id = new.dentist_id)
                 and tstzrange(t.starts_at, t.ends_at)
                     && tstzrange(new.starts_at, public.appointment_end(new.starts_at, new.duration_min))) then
      raise exception 'That time is blocked off in your calendar.';
    end if;
  end if;
  return new;
end;
$$;

-- A charge from the price list takes the clinic's materials for it off stock
create or replace function public.use_materials_for_charge()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.treatment_slug is not null then
    insert into public.stock_moves (owner_id, item_id, kind, qty, charge_id, note)
    select new.owner_id, tm.item_id, 'use', -tm.qty, new.id, left(new.description, 200)
    from public.treatment_materials tm
    where tm.clinic_id = new.clinic_id and tm.treatment_slug = new.treatment_slug and tm.charge_description = new.description;
  end if;
  return new;
end;
$$;

-- Confirming a website request: the clinic's request, its time off and patient (it was by login). A dentist's
-- own time off is checked when the appointment is made, after its dentist is known.
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
  where b.id = p_request and b.clinic_id = (select public.my_clinic_id())
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
             where t.clinic_id = r.clinic_id and t.dentist_id is null
               and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, public.appointment_end(p_starts_at, p_minutes))) then
    raise exception 'That time is blocked off in your calendar.';
  end if;

  if p_patient is not null then
    select p.id into v_patient from public.patients p
    where p.id = p_patient and p.clinic_id = r.clinic_id;
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

-- Loading the sheet: the clinic's whole list replaced at once, or not at all
create or replace function public.replace_price_list(p_items jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select public.my_clinic_id()) is null then
    raise exception 'Not signed in';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'A price list has 1 to 500 lines';
  end if;
  delete from public.price_list where clinic_id = (select public.my_clinic_id());
  insert into public.price_list (owner_id, line_no, slug, treatment, description, detail, cost)
  select (select auth.uid()), i.ord::integer, i.item->>'slug', i.item->>'treatment',
         coalesce(i.item->>'description', ''), coalesce(i.item->>'detail', ''), i.item->>'cost'
  from jsonb_array_elements(p_items) with ordinality as i(item, ord);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The list the website reads: the clinic's (still found through app_config's login until slice 4)
create or replace function public.public_price_list()
returns table (line_no integer, slug text, treatment text, description text, detail text, cost text)
language sql stable security definer set search_path = ''
as $$
  select p.line_no, p.slug, p.treatment, p.description, p.detail, p.cost
  from public.price_list p
  where p.clinic_id = (select m.clinic_id from public.clinic_members m
                       join public.app_config c on c.id and m.user_id = c.clinic_owner_id
                       order by m.created_at, m.clinic_id limit 1)
  order by p.line_no
$$;

-- One per clinic, beside the per-person keys the app still names (they go in slice 2b) -----------------------
create unique index if not exists tally_settings_one_per_clinic on public.tally_settings (clinic_id);
create unique index if not exists treatment_materials_once_per_clinic
  on public.treatment_materials (clinic_id, treatment_slug, charge_description, item_id);
create unique index if not exists stock_items_clinic_name on public.stock_items (clinic_id, lower(name)) where not archived;
create unique index if not exists price_list_once_per_clinic on public.price_list (clinic_id, treatment, detail);

-- Multi-clinic, slice 3a (30 Oct 2026, supabase/multi-clinic-3-2026-10.sql): the clinic's details (place, phone, address,
-- links, UPI, logo, Tally, chair monitor) and each dentist's (short names, qualifications, registration, signature)
-- in the database, Smile Dental Clinic's filled in. Clinic OS reads them from slice 3b.

-- The clinic's details --------------------------------------------------------------------------------------
alter table public.clinics
  add column if not exists place text check (char_length(place) <= 60),
  add column if not exists place_kn text check (char_length(place_kn) <= 60),
  add column if not exists phone text check (char_length(phone) <= 30),
  add column if not exists whatsapp text check (char_length(whatsapp) <= 30),
  add column if not exists email text check (char_length(email) <= 120),
  add column if not exists address text check (char_length(address) <= 300),
  add column if not exists short_address text check (char_length(short_address) <= 120),
  add column if not exists maps_link text check (maps_link ~ '^https://' and char_length(maps_link) <= 300),
  add column if not exists review_link text check (review_link ~ '^https://' and char_length(review_link) <= 300),
  add column if not exists upi_id text check (char_length(upi_id) <= 100),
  add column if not exists upi_payee text check (char_length(upi_payee) <= 100),
  add column if not exists logo text check (char_length(logo) <= 300),
  -- {version, company, cashLedger, bankLedger, patientGroup, incomeLedger}: what Send to Tally starts from
  add column if not exists tally jsonb not null default '{}'::jsonb,
  -- {name, wifi, password, address}: the chair's camera monitor, where a clinic has one
  add column if not exists chair_monitor jsonb;

-- A dentist's details (a visiting specialist's too) ---------------------------------------------------------
alter table public.dentists
  add column if not exists short_name text check (char_length(short_name) <= 60),
  add column if not exists short_name_kn text check (char_length(short_name_kn) <= 60),
  add column if not exists qualifications text check (char_length(qualifications) <= 200),
  add column if not exists registration text check (char_length(registration) <= 60),
  add column if not exists signature text check (char_length(signature) <= 300);

-- Smile Dental Clinic, as src/config/site.ts has it (each value verified with the owner) ---------------------
update public.clinics set
  place = 'Katapadi',
  place_kn = 'ಕಟಪಾಡಿ',
  phone = '+91 6361816711',
  whatsapp = '+91 6361816711',
  email = 'smiledental8925@gmail.com',
  address = '1st Floor, YM Zohara Building, Shirva Rd, near Bank of Baroda (formerly Vijaya Bank), Yenna Gudde, Katapadi - 574105',
  short_address = '1st Floor, YM Zohara Building, Shirva Road, Katapadi',
  maps_link = 'https://maps.app.goo.gl/b8YHvgUQt4hPuCQL6',
  review_link = 'https://g.page/r/CUdtAiciUfvKEBM/review',
  upi_id = 'rahil.yusuf.k-1@okhdfcbank',
  upi_payee = 'Smile Dental Clinic',
  logo = '/images/logo.jpg',
  tally = jsonb_build_object('version', 'Tally.ERP 9', 'company', 'SMILE DENTAL0', 'cashLedger', 'Cash',
                             'bankLedger', 'Savings A/C', 'patientGroup', 'Direct Incomes', 'incomeLedger', ''),
  chair_monitor = jsonb_build_object('name', 'Intellicam', 'wifi', 'Q5Y422EW500-294', 'password', '12345678',
                                     'address', 'http://192.168.1.1')
where slug = 'smile-dental-katapadi' and phone is null;

update public.dentists d set
  short_name = 'Dr. Rahil',
  short_name_kn = 'ಡಾ. ರಾಹಿಲ್',
  qualifications = 'BDS, November 2020 - Yenapoya Deemed to be University',
  registration = '51950-A',
  signature = '/images/signature.png'
from public.clinics c
where c.id = d.clinic_id and c.slug = 'smile-dental-katapadi' and d.name = 'Dr. Rahil Yusuf' and d.short_name is null;

-- Multi-clinic, slice 3b (30 Oct 2026, supabase/multi-clinic-3b-2026-10.sql): the patient's link page learns its clinic
-- from the link: shared_photos() returns the clinic's details and the prescribing dentist's (an expired link, the
-- clinic's name and phone).

create or replace function public.shared_photos(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.expires_at > now()
    then jsonb_build_object(
      'visit_date', v.visit_date,
      'first_name', split_part(btrim(p.name), ' ', 1),
      'language', p.language,
      'expires_at', s.expires_at,
      'photos', s.photos,
      'clinic', jsonb_build_object(
        'name', c.name, 'place', c.place, 'place_kn', c.place_kn, 'phone', c.phone, 'address', c.address, 'logo', c.logo,
        'dentist', (select jsonb_build_object('name', d.name, 'qualifications', d.qualifications,
                                              'registration', d.registration, 'signature', d.signature)
                    from public.dentists d
                    where d.clinic_id = c.id and d.active
                    order by (d.user_id is not distinct from v.owner_id) desc, d.created_at, d.id
                    limit 1)))
    else jsonb_build_object('expired', true, 'clinic', jsonb_build_object('name', c.name, 'place', c.place, 'phone', c.phone))
  end
  from public.share_links s
  join public.visits v on v.id = s.visit_id
  join public.patients p on p.id = v.patient_id
  join public.clinics c on c.id = v.clinic_id
  where char_length(p_token) between 32 and 128 and s.token = p_token
$$;

revoke all on function public.shared_photos(text) from public, anon, authenticated;
grant execute on function public.shared_photos(text) to anon, authenticated;

-- Multi-clinic, slice 4 (30 Oct 2026, supabase/multi-clinic-4-2026-10.sql): the public side per clinic. The website's
-- functions take the clinic's slug; the booking pause is the clinic's; notifications reach every member with a
-- phone. The versions without a slug serve app_config's clinic until slice 4's clean-up.

-- The booking pause is the clinic's ------------------------------------------------------------------------
alter table public.clinics add column if not exists booking_paused_until timestamptz;

-- Smile Dental Clinic's, from app_config (where it was), once
update public.clinics c set booking_paused_until = a.booking_paused_until
from public.app_config a
join public.clinic_members m on m.user_id = a.clinic_owner_id
where a.id and c.id = m.clinic_id and c.booking_paused_until is null and a.booking_paused_until is not null;

-- app_config's clinic, for the versions without a slug while the website moves to its own
create or replace function public.app_config_clinic_slug()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.slug from public.app_config a
  join public.clinic_members m on m.user_id = a.clinic_owner_id
  join public.clinics c on c.id = m.clinic_id
  where a.id
  order by m.created_at, m.clinic_id
  limit 1
$$;

revoke all on function public.app_config_clinic_slug() from public, anon, authenticated;

-- Free times on a clinic's website ---------------------------------------------------------------------------
-- The same rules as before (next 28 days, the clinic's blocks, not started, before 7 PM, clear of booked
-- appointments, time off and held requests), all of them the clinic's. None for a clinic unknown or paused.
create or replace function public.get_open_slots(p_clinic text, p_from date default null, p_days integer default 28)
returns table (slot_start timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select c.id as clinic_id from public.clinics c
    where c.slug = p_clinic and (c.booking_paused_until is null or c.booking_paused_until <= public.clinic_now())
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
      where a.clinic_id = cfg.clinic_id and a.status = 'booked'
        and tstzrange(a.starts_at, public.appointment_end(a.starts_at, a.duration_min))
            && tstzrange(s.slot, public.appointment_end(s.slot, 30)))
    and not exists (
      select 1 from public.time_off t
      where t.clinic_id = cfg.clinic_id
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(s.slot, public.appointment_end(s.slot, 30)))
    and not exists (
      select 1 from public.booking_requests b
      where b.clinic_id = cfg.clinic_id and b.status = 'new' and b.requested_start is not null
        and b.received_at is not null
        and public.request_hold_until(b.received_at, b.requested_start) > public.clinic_now()
        and tstzrange(b.requested_start, public.appointment_end(b.requested_start, 30))
            && tstzrange(s.slot, public.appointment_end(s.slot, 30)))
  order by s.slot
$$;

revoke all on function public.get_open_slots(text, date, integer) from public, anon, authenticated;
grant execute on function public.get_open_slots(text, date, integer) to anon, authenticated;

-- Without a slug: Smile Dental Clinic's, until the website names its own
create or replace function public.get_open_slots(p_from date default null, p_days integer default 28)
returns table (slot_start timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.slot_start from public.get_open_slots(public.app_config_clinic_slug(), p_from, p_days) o
$$;

-- Whether a clinic's online booking is paused: until when, or null when it is open -------------------------
create or replace function public.booking_paused_until(p_clinic text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select c.booking_paused_until from public.clinics c
  where c.slug = p_clinic and c.booking_paused_until > public.clinic_now()
$$;

revoke all on function public.booking_paused_until(text) from public, anon, authenticated;
grant execute on function public.booking_paused_until(text) to anon, authenticated;

create or replace function public.booking_paused_until()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select public.booking_paused_until(public.app_config_clinic_slug())
$$;

-- A member pauses their clinic's online booking until a time ('infinity': until turned back on), or opens it
create or replace function public.set_booking_pause(p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select public.my_clinic_id()) is null then
    raise exception 'Not allowed';
  end if;
  update public.clinics set booking_paused_until = p_until where id = (select public.my_clinic_id());
end;
$$;

-- A request from a clinic's website ---------------------------------------------------------------------------
-- As before (every failure says, for the visitor, what to do), into the clinic named by its slug: its owner's,
-- its free times, and its limits.
create or replace function public.submit_booking_request(
  p_clinic text,
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
  v_clinic uuid;
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

  -- The clinic, and its owner (whose list the request lands in)
  select c.id into v_clinic from public.clinics c where c.slug = p_clinic;
  select m.user_id into v_owner from public.clinic_members m
  where m.clinic_id = v_clinic and m.role = 'owner'
  order by m.created_at limit 1;
  if v_clinic is null or v_owner is null then
    raise exception 'Online booking is not set up yet. Please call or WhatsApp the clinic.';
  end if;
  if exists (select 1 from public.clinics c where c.id = v_clinic and c.booking_paused_until > v_now) then
    raise exception 'Online booking is paused right now. Please call or WhatsApp the clinic.';
  end if;

  -- Rate limits and the free-block check, per clinic. The lock makes one clinic's concurrent submissions run
  -- one at a time, so two visitors can never take the same block.
  perform pg_advisory_xact_lock(hashtext('public.submit_booking_request:' || v_clinic::text));
  if exists (select 1 from public.booking_requests b
             where b.clinic_id = v_clinic and b.phone = v_phone and b.status = 'new' and b.created_at > v_now - interval '24 hours') then
    raise exception 'You already have a request waiting. The clinic will confirm it on WhatsApp shortly.';
  end if;
  if (select count(*) from public.booking_requests b
      where b.clinic_id = v_clinic and b.phone = v_phone and b.created_at > v_now - interval '24 hours') >= 3 then
    raise exception 'We already have your requests from this number today. The clinic will contact you soon, or please call or WhatsApp the clinic.';
  end if;
  if v_ip is not null and (select count(*) from public.booking_requests b
      where b.clinic_id = v_clinic and b.client_ip = v_ip and b.created_at > v_now - interval '24 hours') >= 5 then
    raise exception 'We already have several requests from this device today. Please call or WhatsApp the clinic.';
  end if;
  if (select count(*) from public.booking_requests b
      where b.clinic_id = v_clinic and b.created_at > v_now - interval '24 hours') >= 200 then
    raise exception 'Online booking is busy right now. Please call or WhatsApp the clinic.';
  end if;

  if not exists (select 1 from public.get_open_slots(p_clinic, null, 28) o where o.slot_start = p_requested_start) then
    raise exception 'That time is no longer available. Please choose another.';
  end if;

  insert into public.booking_requests (
    owner_id, clinic_id, name, phone, gender, birth_year, address, medical_alerts, heard_from,
    reason, notes, requested_start, client_ip, status, created_at
  )
  values (
    v_owner, v_clinic, v_name, v_phone, v_gender, p_birth_year, v_address, v_alerts, v_heard,
    v_reason, v_notes, p_requested_start, v_ip, 'new', v_now
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_booking_request(text, text, text, text, text, text, text, text, timestamptz, text, integer)
  from public, anon, authenticated;
grant execute on function public.submit_booking_request(text, text, text, text, text, text, text, text, timestamptz, text, integer)
  to anon, authenticated;

-- Without a slug: into Smile Dental Clinic, until the website names its own
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
language sql
security definer
set search_path = ''
as $$
  select public.submit_booking_request(public.app_config_clinic_slug(), p_name, p_phone, p_address, p_medical_alerts,
    p_heard_from, p_reason, p_notes, p_requested_start, p_gender, p_birth_year)
$$;

-- The price list a clinic's website shows ------------------------------------------------------------------------
create or replace function public.public_price_list(p_clinic text)
returns table (line_no integer, slug text, treatment text, description text, detail text, cost text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.line_no, p.slug, p.treatment, p.description, p.detail, p.cost
  from public.price_list p
  join public.clinics c on c.id = p.clinic_id
  where c.slug = p_clinic
  order by p.line_no
$$;

revoke all on function public.public_price_list(text) from public;
grant execute on function public.public_price_list(text) to anon, authenticated;

create or replace function public.public_price_list()
returns table (line_no integer, slug text, treatment text, description text, detail text, cost text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.line_no, l.slug, l.treatment, l.description, l.detail, l.cost
  from public.public_price_list(public.app_config_clinic_slug()) l
$$;

-- Notifications to every member of the clinic -------------------------------------------------------------------
-- A website request just came in: each member with a phone set up, once each (their own log)
create or replace function public.notify_new_request_all(p_secret text, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  m record;
  v_out jsonb := '[]'::jsonb;
begin
  if not public.notify_secret_ok(p_secret) then
    raise exception 'Not allowed';
  end if;
  select b.clinic_id, b.name, b.reason, b.requested_start into r
    from public.booking_requests b where b.id = p_request and b.status = 'new';
  if not found then
    return null;
  end if;
  for m in
    select cm.user_id from public.clinic_members cm
    where cm.clinic_id = r.clinic_id
      and exists (select 1 from public.push_subscriptions p where p.owner_id = cm.user_id)
    order by cm.created_at, cm.user_id
  loop
    insert into public.notification_log (owner_id, kind, ref) values (m.user_id, 'new_request', p_request::text)
      on conflict do nothing;
    if found then
      v_out := v_out || jsonb_build_array(public.notify_target(m.user_id) || jsonb_build_object('items', jsonb_build_array(
        jsonb_build_object('kind', 'new_request', 'ref', p_request, 'name', r.name, 'reason', r.reason, 'starts_at', r.requested_start))));
    end if;
  end loop;
  return case when jsonb_array_length(v_out) = 0 then null else v_out end;
end;
$$;

revoke all on function public.notify_new_request_all(text, uuid) from public;
grant execute on function public.notify_new_request_all(text, uuid) to anon, authenticated;

-- Every 5 minutes: what is due now, each once, for every member of every clinic who has a phone set up. A
-- website request still waiting 30 minutes after it came in (looking back 12 hours), and from 8:15 AM on a day
-- the clinic opens (not a Friday, not the whole morning off), the morning brief with what is low on stock.
create or replace function public.notify_due_all(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := public.clinic_now();
  v_local timestamp := public.clinic_now() at time zone 'Asia/Kolkata';
  v_today date := (public.clinic_now() at time zone 'Asia/Kolkata')::date;
  v_out jsonb := '[]'::jsonb;
  v_items jsonb;
  v_brief jsonb;
  c record;
  m record;
  r record;
begin
  if not public.notify_secret_ok(p_secret) then
    raise exception 'Not allowed';
  end if;
  for c in select cl.id from public.clinics cl order by cl.created_at, cl.id loop
    -- The clinic's morning brief, the same for each of its members
    v_brief := null;
    if v_local::time >= time '08:15' and v_local::time < time '12:00'
       and extract(isodow from v_today) <> 5
       and not exists (select 1 from public.time_off t
                       where t.clinic_id = c.id and t.dentist_id is null
                         and t.starts_at <= (v_today + time '08:30') at time zone 'Asia/Kolkata'
                         and t.ends_at >= (v_today + time '13:00') at time zone 'Asia/Kolkata') then
      v_brief := jsonb_build_object(
        'kind', 'morning_brief', 'ref', v_today,
        'booked', (select count(*) from public.appointments a
                   where a.clinic_id = c.id and a.status = 'booked'
                     and (a.starts_at at time zone 'Asia/Kolkata')::date = v_today),
        'first_at', (select min(a.starts_at) from public.appointments a
                     where a.clinic_id = c.id and a.status = 'booked'
                       and (a.starts_at at time zone 'Asia/Kolkata')::date = v_today),
        'waiting', (select count(*) from public.booking_requests b where b.clinic_id = c.id and b.status = 'new'),
        -- What is at or below its low level, lowest first (at most five names)
        'low', coalesce((select jsonb_agg(low.name order by low.share)
                         from (select s.name, s.on_hand / s.low_level as share
                               from (select i.name, i.low_level,
                                            coalesce((select sum(mv.qty) from public.stock_moves mv where mv.item_id = i.id), 0) as on_hand
                                     from public.stock_items i
                                     where i.clinic_id = c.id and not i.archived and i.low_level > 0) s
                               where s.on_hand <= s.low_level
                               order by s.on_hand / s.low_level
                               limit 5) low), '[]'::jsonb));
    end if;

    for m in
      select cm.user_id from public.clinic_members cm
      where cm.clinic_id = c.id
        and exists (select 1 from public.push_subscriptions p where p.owner_id = cm.user_id)
      order by cm.created_at, cm.user_id
    loop
      v_items := '[]'::jsonb;
      for r in
        select b.id, b.name, b.reason, b.requested_start, b.created_at
        from public.booking_requests b
        where b.clinic_id = c.id and b.status = 'new' and b.received_at is null
          and b.created_at <= v_now - interval '30 minutes' and b.created_at > v_now - interval '12 hours'
          and not exists (select 1 from public.notification_log l
                          where l.owner_id = m.user_id and l.kind = 'waiting_request' and l.ref = b.id::text)
        order by b.created_at
      loop
        insert into public.notification_log (owner_id, kind, ref) values (m.user_id, 'waiting_request', r.id::text)
          on conflict do nothing;
        v_items := v_items || jsonb_build_array(jsonb_build_object('kind', 'waiting_request', 'ref', r.id, 'name', r.name,
          'reason', r.reason, 'starts_at', r.requested_start, 'created_at', r.created_at));
      end loop;
      if v_brief is not null and not exists (select 1 from public.notification_log l
                                             where l.owner_id = m.user_id and l.kind = 'morning_brief' and l.ref = v_today::text) then
        insert into public.notification_log (owner_id, kind, ref) values (m.user_id, 'morning_brief', v_today::text)
          on conflict do nothing;
        v_items := v_items || jsonb_build_array(v_brief);
      end if;
      if jsonb_array_length(v_items) > 0 then
        v_out := v_out || jsonb_build_array(public.notify_target(m.user_id) || jsonb_build_object('items', v_items));
      end if;
    end loop;
  end loop;
  return case when jsonb_array_length(v_out) = 0 then null else v_out end;
end;
$$;

revoke all on function public.notify_due_all(text) from public;
grant execute on function public.notify_due_all(text) to anon, authenticated;

-- Multi-clinic, slice 5 (30 Oct 2026, supabase/multi-clinic-5-2026-10.sql): setting a clinic up in one call (the operator's),
-- and the demo clinic's invented records.

create or replace function public.setup_clinic(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic uuid;
  v_user uuid;
  v_member jsonb;
  v_chair jsonb;
  v_dentist jsonb;
begin
  if coalesce(p->>'slug', '') = '' or coalesce(p->>'name', '') = '' then
    raise exception 'A clinic needs its slug and name';
  end if;

  insert into public.clinics (slug, name, place, place_kn, phone, whatsapp, email, address, short_address, maps_link,
                              review_link, upi_id, upi_payee, logo, tally, chair_monitor)
  values (p->>'slug', p->>'name', p->>'place', p->>'placeKn', p->>'phone', coalesce(p->>'whatsapp', p->>'phone'), p->>'email',
          p->>'address', p->>'shortAddress', p->>'mapsLink', p->>'reviewLink', p->'upi'->>'id', p->'upi'->>'payee', p->>'logo',
          coalesce(p->'tally', '{}'::jsonb), p->'chairMonitor')
  on conflict (slug) do update set
    name = excluded.name, place = excluded.place, place_kn = excluded.place_kn, phone = excluded.phone,
    whatsapp = excluded.whatsapp, email = excluded.email, address = excluded.address, short_address = excluded.short_address,
    maps_link = excluded.maps_link, review_link = excluded.review_link, upi_id = excluded.upi_id, upi_payee = excluded.upi_payee,
    logo = excluded.logo, tally = excluded.tally, chair_monitor = excluded.chair_monitor
  returning id into v_clinic;

  -- Its people, by the email of their login (owner, dentist or assistant)
  for v_member in select * from jsonb_array_elements(coalesce(p->'members', '[]'::jsonb)) loop
    select u.id into v_user from auth.users u where lower(u.email) = lower(v_member->>'email');
    if v_user is null then
      raise exception 'Make the login for % first (Supabase: Authentication, Add user), then set the clinic up again', v_member->>'email';
    end if;
    insert into public.clinic_members (clinic_id, user_id, role)
    values (v_clinic, v_user, coalesce(v_member->>'role', 'owner'))
    on conflict (clinic_id, user_id) do update set role = excluded.role;
  end loop;

  -- Its chairs, by name (at least one)
  for v_chair in select * from jsonb_array_elements(coalesce(p->'chairs', '["Chair 1"]'::jsonb)) loop
    insert into public.chairs (clinic_id, name)
    select v_clinic, v_chair #>> '{}'
    where not exists (select 1 from public.chairs h where h.clinic_id = v_clinic and h.name = v_chair #>> '{}');
  end loop;

  -- Its dentists, by name; one with a login is linked to it (by email)
  for v_dentist in select * from jsonb_array_elements(coalesce(p->'dentists', '[]'::jsonb)) loop
    v_user := null;
    if coalesce(v_dentist->>'email', '') <> '' then
      select u.id into v_user from auth.users u where lower(u.email) = lower(v_dentist->>'email');
    end if;
    update public.dentists d set user_id = coalesce(v_user, d.user_id), short_name = v_dentist->>'shortName',
      short_name_kn = v_dentist->>'shortNameKn', qualifications = v_dentist->>'qualifications',
      registration = v_dentist->>'registration', signature = v_dentist->>'signature', active = true
    where d.clinic_id = v_clinic and d.name = v_dentist->>'name';
    if not found then
      insert into public.dentists (clinic_id, name, user_id, short_name, short_name_kn, qualifications, registration, signature)
      values (v_clinic, v_dentist->>'name', v_user, v_dentist->>'shortName', v_dentist->>'shortNameKn',
              v_dentist->>'qualifications', v_dentist->>'registration', v_dentist->>'signature');
    end if;
  end loop;

  return v_clinic;
end;
$$;

revoke all on function public.setup_clinic(jsonb) from public, anon, authenticated;

-- The demo clinic's invented records, from today ---------------------------------------------------------------
create or replace function public.seed_demo_clinic(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic uuid;
  v_owner uuid;
  v_today date := (public.clinic_now() at time zone 'Asia/Kolkata')::date;
  v_day date;
  v_next date;
  v_patient uuid;
  v_visit uuid;
  v_item uuid;
  v_names text[] := array['Ananya Hegde', 'Rohan Kamath', 'Priya Nayak', 'Vikram Shetty', 'Divya Pai', 'Karthik Bhat',
                          'Sneha Rao', 'Arjun Acharya', 'Meghana Prabhu', 'Nikhil Kini'];
  v_reasons text[] := array['Check-up', 'Cleaning', 'Toothache', 'Filling', 'Root canal', 'Crown or bridge'];
  v_patients uuid[] := '{}';
  v_time time;
  v_start timestamptz;
  i integer;
begin
  if p_slug !~ '^demo-' then
    raise exception 'Only a demo clinic (its slug starts "demo-") is filled with invented records';
  end if;
  select c.id into v_clinic from public.clinics c where c.slug = p_slug;
  select m.user_id into v_owner from public.clinic_members m
  where m.clinic_id = v_clinic and m.role = 'owner' order by m.created_at limit 1;
  if v_clinic is null or v_owner is null then
    raise exception 'Set the demo clinic up first, with its owner''s login (setup_clinic)';
  end if;

  -- Start over: this clinic's records only (its chairs, dentists and members stay)
  delete from public.booking_requests where clinic_id = v_clinic;
  delete from public.appointments where clinic_id = v_clinic;
  delete from public.time_off where clinic_id = v_clinic;
  delete from public.patients where clinic_id = v_clinic;
  delete from public.stock_moves where clinic_id = v_clinic;
  delete from public.treatment_materials where clinic_id = v_clinic;
  delete from public.stock_items where clinic_id = v_clinic;
  delete from public.costs where clinic_id = v_clinic;
  delete from public.fixed_costs where clinic_id = v_clinic;
  delete from public.price_list where clinic_id = v_clinic;

  -- Ten invented patients (Indian mobile numbers that are not real: 900000000x)
  for i in 1 .. array_length(v_names, 1) loop
    insert into public.patients (owner_id, clinic_id, name, phone, gender, birth_year, consent_at)
    values (v_owner, v_clinic, v_names[i], '90000000' || lpad(i::text, 2, '0'),
            case when i % 2 = 0 then 'male' else 'female' end, 1960 + i * 4, now())
    returning id into v_patient;
    v_patients := v_patients || v_patient;
  end loop;

  -- The next open days (not the clinic's closed weekday)
  v_day := v_today;
  while extract(isodow from v_day) = 5 loop v_day := v_day + 1; end loop;
  v_next := v_day + 1;
  while extract(isodow from v_next) = 5 loop v_next := v_next + 1; end loop;

  -- Today: a time already over was seen (its visit billed, paid and sent); the rest are booked
  i := 0;
  foreach v_time in array array[time '09:00', time '10:30', time '12:00', time '15:00', time '16:30', time '18:00'] loop
    i := i + 1;
    v_start := (v_day + v_time) at time zone 'Asia/Kolkata';
    if v_start + interval '30 minutes' <= public.clinic_now() then
      insert into public.visits (owner_id, clinic_id, patient_id, visit_date, notes)
      values (v_owner, v_clinic, v_patients[i], v_day, 'Complaint: sensitivity, lower right. Scaling and polishing done.')
      returning id into v_visit;
      insert into public.visit_charges (owner_id, clinic_id, visit_id, patient_id, description, amount, kind)
      values (v_owner, v_clinic, v_visit, v_patients[i], 'Scaling – Full mouth', 800, 'item');
      insert into public.payments (owner_id, clinic_id, visit_id, patient_id, amount, method)
      values (v_owner, v_clinic, v_visit, v_patients[i], 800, case when i % 2 = 0 then 'upi' else 'cash' end);
      -- Sent once billed, so it isn't "bill changed after sending"
      update public.visits set closed_at = now(), resend_needed = false where id = v_visit;
    else
      insert into public.appointments (owner_id, clinic_id, patient_id, starts_at, duration_min, reason, status)
      values (v_owner, v_clinic, v_patients[i], v_start, 30, v_reasons[1 + (i % array_length(v_reasons, 1))], 'booked');
    end if;
  end loop;

  -- The next open day: four to remind
  i := 6;
  foreach v_time in array array[time '10:00', time '11:00', time '15:30', time '17:00'] loop
    i := i + 1;
    insert into public.appointments (owner_id, clinic_id, patient_id, starts_at, duration_min, reason, status)
    values (v_owner, v_clinic, v_patients[i], (v_next + v_time) at time zone 'Asia/Kolkata', 30,
            v_reasons[1 + (i % array_length(v_reasons, 1))], 'booked');
  end loop;

  -- Earlier visits: billed and paid, and one that still owes
  for i in 1 .. 4 loop
    insert into public.visits (owner_id, clinic_id, patient_id, visit_date, notes)
    values (v_owner, v_clinic, v_patients[i + 6], v_today - (i * 7), 'Teeth: 36 deep caries; GIC filling done.')
    returning id into v_visit;
    insert into public.visit_charges (owner_id, clinic_id, visit_id, patient_id, description, amount, kind)
    values (v_owner, v_clinic, v_visit, v_patients[i + 6], 'Fillings – GIC', 700 + i * 100, 'item');
    if i < 4 then
      insert into public.payments (owner_id, clinic_id, visit_id, patient_id, amount, method)
      values (v_owner, v_clinic, v_visit, v_patients[i + 6], 700 + i * 100, case when i % 2 = 0 then 'upi' else 'cash' end);
    end if;
    update public.visits set closed_at = now() - make_interval(days => i * 7), resend_needed = false where id = v_visit;
  end loop;

  -- A website request waiting for a decision
  insert into public.booking_requests (owner_id, clinic_id, name, phone, reason, requested_start, status)
  values (v_owner, v_clinic, 'Lakshmi Bhandary', '9000000011', 'Toothache',
          ((v_next + time '16:00') at time zone 'Asia/Kolkata'), 'new');

  -- Stock, one item running low
  insert into public.stock_items (owner_id, clinic_id, name, unit, low_level) values (v_owner, v_clinic, 'Gloves', 'box', 3)
  returning id into v_item;
  insert into public.stock_moves (owner_id, clinic_id, item_id, kind, qty, note) values (v_owner, v_clinic, v_item, 'in', 2, 'Starting count');
  insert into public.stock_items (owner_id, clinic_id, name, unit, low_level) values (v_owner, v_clinic, 'GIC capsule', 'capsule', 10)
  returning id into v_item;
  insert into public.stock_moves (owner_id, clinic_id, item_id, kind, qty, note) values (v_owner, v_clinic, v_item, 'in', 40, 'Starting count');

  -- A price list of its own
  insert into public.price_list (owner_id, clinic_id, line_no, slug, treatment, description, detail, cost) values
    (v_owner, v_clinic, 1, 'consultation', 'Consultation', 'An examination and advice.', 'Standard', '300/-'),
    (v_owner, v_clinic, 2, 'scaling', 'Scaling', 'Cleaning and polishing.', 'Full mouth', '800/-'),
    (v_owner, v_clinic, 3, 'fillings', 'Fillings', 'Tooth-coloured fillings.', 'GIC', '800/-'),
    (v_owner, v_clinic, 4, 'fillings', 'Fillings', '', 'Composite', '1,400/-'),
    (v_owner, v_clinic, 5, 'root-canal-treatment', 'Root Canal Treatment', 'Saves an infected tooth.', 'Standard', '4,000/-'),
    (v_owner, v_clinic, 6, 'crowns', 'Crowns', 'Caps for a weak tooth.', 'Zirconia', '7,000/- (Per Crown)');

  return jsonb_build_object('clinic', p_slug, 'patients', array_length(v_patients, 1), 'today', v_day, 'tomorrow', v_next);
end;
$$;

revoke all on function public.seed_demo_clinic(text) from public, anon, authenticated;
