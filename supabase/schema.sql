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

-- The 15 clinic blocks of a day, as 40-minute starts in India time, following the Google
-- Business Profile hours (8:30 AM-1:00 PM, 2:30-7:30 PM). The last block of each session may run
-- a little past closing (12:30 ends 1:10, 7:10 PM ends 7:50). Online booking never offers 7 PM+.
--   8:30 9:10 9:50 10:30 11:10 11:50 12:30
--   2:30 3:10 3:50 4:30 5:10 5:50 6:30 7:10
-- Fridays have none.
create or replace function public.clinic_slots(p_date date)
returns setof timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_date::timestamp) + make_interval(mins => m)) at time zone 'Asia/Kolkata'
  from unnest(array[510, 550, 590, 630, 670, 710, 750, 870, 910, 950, 990, 1030, 1070, 1110, 1150]) as m
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

-- App config: which account owns the clinic (single row) ----------------------
-- Used by submit_booking_request() to know whose list a website request lands in.
create table if not exists public.app_config (
  id boolean primary key default true check (id),
  clinic_owner_id uuid not null references auth.users (id) on delete cascade
);

-- Patients ------------------------------------------------------------------
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,                 -- 10-digit Indian mobile, digits only
  gender text check (gender in ('female', 'male', 'other')),
  birth_year smallint check (birth_year between 1900 and 2100), -- age is shown as this year's age
  address text,
  medical_alerts text,        -- allergies, conditions, regular medicines
  heard_from text,            -- how they heard about the clinic
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  amount numeric(10,2) not null check (amount >= 0),
  kind text not null default 'item' check (kind in ('item', 'extra')),
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_owner_starts_idx on public.appointments (owner_id, starts_at);
create index if not exists appointments_patient_idx on public.appointments (patient_id, starts_at desc);
create index if not exists appointments_from_visit_idx on public.appointments (from_visit_id);
create index if not exists appointments_visit_idx on public.appointments (visit_id);

create or replace trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- No double booking: the database refuses overlapping booked appointments
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
-- applies. Any failure rolls everything back. A block that is already over is refused (the
-- block in progress may still be confirmed). When linking a patient already in the app, what the
-- request says under medical alerts is added to their record, never dropped.
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
  if public.appointment_end(p_starts_at, 40) <= public.clinic_now() then
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
