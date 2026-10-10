-- Phases 3-5 (and 4b): smart notes, money, appointments, booking requests,
-- follow-up reminders, expenses and daily close.
--
-- How to run: Supabase dashboard of the NEW project (pmuecirfwmtsvojxleoq)
--   -> SQL Editor -> New query -> paste this whole file -> Run.
-- Run it AFTER phase2.sql. It is safe to run again: every statement is
-- idempotent (if not exists / or replace / drop policy if exists / on conflict).
--
-- Rules shared by every table (see docs/BUILD_PLAN.md section 3):
--   * owner_id defaults to the signed-in user; RLS "Owner full access".
--   * Rows that point at a patient / visit / treatment item may only point at
--     rows the same owner owns (a second, test account exists).
--   * anon gets nothing. The public website can only call
--     public.submit_booking_request(...).
--   * Money is numeric(10,2) rupees.

-- Keeps updated_at current on every edit (same as phase2.sql; repeated so this
-- file does not depend on run order for the function itself)
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

-- Existing tables: new columns ----------------------------------------------
alter table public.visits add column if not exists notes_original text;     -- raw dictation, kept when the note is tidied
alter table public.visits add column if not exists summary jsonb;           -- visit summary v1 (Zod schema in src/lib/ai/visit-summary.ts)
alter table public.visits add column if not exists confirmed_at timestamptz; -- when the Confirm card was saved

alter table public.patients add column if not exists preferred_times text;   -- e.g. "evenings after 6", "Sunday mornings"

-- Treatment items: the plan and what was done, per tooth ----------------------
create table if not exists public.treatment_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  tooth text,                                   -- FDI number(s), e.g. "46"
  procedure text not null check (length(trim(procedure)) > 0),
  price numeric(10,2) check (price >= 0),       -- decided price
  price_min numeric(10,2) check (price_min >= 0), -- range while the option is undecided
  price_max numeric(10,2) check (price_max >= 0),
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'done', 'cancelled')),
  planned_visit_id uuid references public.visits (id) on delete set null,
  done_visit_id uuid references public.visits (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint treatment_items_price_range_check
    check (price_min is null or price_max is null or price_min <= price_max)
);

create index if not exists treatment_items_patient_status_idx on public.treatment_items (patient_id, status);
create index if not exists treatment_items_owner_status_idx on public.treatment_items (owner_id, status, updated_at desc);
create index if not exists treatment_items_planned_visit_idx on public.treatment_items (planned_visit_id);
create index if not exists treatment_items_done_visit_idx on public.treatment_items (done_visit_id);

create or replace trigger treatment_items_set_updated_at
  before update on public.treatment_items
  for each row execute function public.set_updated_at();

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
  treatment_item_id uuid references public.treatment_items (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visit_charges_visit_idx on public.visit_charges (visit_id, created_at);
create index if not exists visit_charges_patient_idx on public.visit_charges (patient_id);
create index if not exists visit_charges_owner_created_idx on public.visit_charges (owner_id, created_at desc);
create index if not exists visit_charges_treatment_item_idx on public.visit_charges (treatment_item_id);

create or replace trigger visit_charges_set_updated_at
  before update on public.visit_charges
  for each row execute function public.set_updated_at();

-- Payments: money received (payment for today, or an advance) ----------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  visit_id uuid references public.visits (id) on delete set null,
  amount numeric(10,2) not null check (amount > 0),
  method text not null check (method in ('upi', 'cash')),
  kind text not null default 'payment' check (kind in ('payment', 'advance')),
  reference text,                               -- e.g. UPI transaction id
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

-- Share links: private /r/<token> page for the visit bill + prescription ----
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
  reminder_sent_at timestamptz,
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

-- Booking requests from the public website ------------------------------------
-- Inserted only through public.submit_booking_request(...) below.
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  area text check (char_length(area) <= 100),
  city text check (char_length(city) <= 100),
  reason text check (char_length(reason) <= 200),
  preferred_date date,
  preferred_time text check (char_length(preferred_time) <= 20),
  notes text check (char_length(notes) <= 1000),
  is_emergency boolean not null default false,
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
-- Added after the first version of this file; keeps re-runs on an existing table working
alter table public.booking_requests add column if not exists client_ip text;
create index if not exists booking_requests_ip_created_idx on public.booking_requests (client_ip, created_at desc);
create index if not exists booking_requests_patient_idx on public.booking_requests (patient_id);
create index if not exists booking_requests_appointment_idx on public.booking_requests (appointment_id);

create or replace trigger booking_requests_set_updated_at
  before update on public.booking_requests
  for each row execute function public.set_updated_at();

-- Reminder log: what was sent from the "To send today" list -----------------
-- ref_id points at the row the reminder was about (no foreign key, it varies):
--   appointment -> appointments.id, crown / unfinished -> treatment_items.id,
--   recall -> patients.id, booking -> booking_requests.id
create table if not exists public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('appointment', 'crown', 'recall', 'unfinished', 'booking')),
  ref_id uuid not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists reminder_log_owner_kind_ref_idx on public.reminder_log (owner_id, kind, ref_id, sent_at desc);
create index if not exists reminder_log_owner_sent_idx on public.reminder_log (owner_id, sent_at desc);

-- Recurring (fixed monthly) expenses: suggested each month for one-tap confirm
create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  payee text not null default '',
  category text not null default 'other'
    check (category in ('lab', 'materials', 'rent', 'salary', 'utilities', 'equipment', 'other')),
  amount numeric(10,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'upi', 'bank', 'card')),
  day_of_month smallint not null default 1 check (day_of_month between 1 and 28),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_expenses_owner_active_idx on public.recurring_expenses (owner_id, active, day_of_month);

create or replace trigger recurring_expenses_set_updated_at
  before update on public.recurring_expenses
  for each row execute function public.set_updated_at();

-- Expenses ------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spent_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  payee text not null default '',
  category text not null default 'other'
    check (category in ('lab', 'materials', 'rent', 'salary', 'utilities', 'equipment', 'other')),
  description text not null default '',
  amount numeric(10,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'upi', 'bank', 'card')),
  patient_id uuid references public.patients (id) on delete set null,
  treatment_item_id uuid references public.treatment_items (id) on delete set null,
  receipt_path text,                            -- expense-receipts bucket: <owner id>/<file>
  recurring_expense_id uuid references public.recurring_expenses (id) on delete set null, -- confirmed from this fixed cost
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- (in case an earlier draft of this table was created without the column)
alter table public.expenses add column if not exists recurring_expense_id uuid
  references public.recurring_expenses (id) on delete set null;

create index if not exists expenses_owner_spent_idx on public.expenses (owner_id, spent_on desc, created_at desc);
create index if not exists expenses_patient_idx on public.expenses (patient_id);
create index if not exists expenses_treatment_item_idx on public.expenses (treatment_item_id);
create index if not exists expenses_recurring_idx on public.expenses (recurring_expense_id, spent_on desc);

create or replace trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- Day closes: one per owner per day -------------------------------------------
create table if not exists public.day_closes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  cash_counted numeric(10,2) not null check (cash_counted >= 0),
  cash_expected numeric(10,2) not null,         -- may be negative if cash expenses exceed cash taken
  note text not null default '',
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint day_closes_owner_day_key unique (owner_id, day)
);

create or replace trigger day_closes_set_updated_at
  before update on public.day_closes
  for each row execute function public.set_updated_at();

-- App config: which account owns the clinic (single row) ----------------------
-- Used by submit_booking_request() to know whose list a website request lands in.
create table if not exists public.app_config (
  id boolean primary key default true check (id),
  clinic_owner_id uuid not null references auth.users (id) on delete cascade
);

-- Seed with Dr. Rahil's account. If that login does not exist yet, this inserts
-- nothing and website requests fail with "Online booking is not set up yet";
-- create the login, then run this file (or just this statement) again.
-- To point at a different account later:
--   update public.app_config set clinic_owner_id = (select id from auth.users where email = '<email>');
insert into public.app_config (clinic_owner_id)
select id from auth.users where email = 'smiledental8925@gmail.com'
on conflict (id) do nothing;

-- Access: only the signed-in owner can see or change their own rows ---------
alter table public.treatment_items enable row level security;
alter table public.visit_charges enable row level security;
alter table public.payments enable row level security;
alter table public.share_links enable row level security;
alter table public.appointments enable row level security;
alter table public.booking_requests enable row level security;
alter table public.reminder_log enable row level security;
alter table public.expenses enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.day_closes enable row level security;
alter table public.app_config enable row level security;

-- Phase 2 tables, tightened: a visit must be for one of the caller's patients,
-- and a photo must be on one of the caller's visits.
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

drop policy if exists "Owner full access" on public.treatment_items;
create policy "Owner full access" on public.treatment_items
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.patients p
                where p.id = treatment_items.patient_id and p.owner_id = (select auth.uid()))
    and (treatment_items.planned_visit_id is null or exists (
          select 1 from public.visits v
          where v.id = treatment_items.planned_visit_id and v.owner_id = (select auth.uid())
            and v.patient_id = treatment_items.patient_id))
    and (treatment_items.done_visit_id is null or exists (
          select 1 from public.visits v
          where v.id = treatment_items.done_visit_id and v.owner_id = (select auth.uid())
            and v.patient_id = treatment_items.patient_id))
  );

drop policy if exists "Owner full access" on public.visit_charges;
create policy "Owner full access" on public.visit_charges
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.visits v
                where v.id = visit_charges.visit_id and v.owner_id = (select auth.uid())
                  and v.patient_id = visit_charges.patient_id)
    and (visit_charges.treatment_item_id is null or exists (
          select 1 from public.treatment_items t
          where t.id = visit_charges.treatment_item_id and t.owner_id = (select auth.uid())
            and t.patient_id = visit_charges.patient_id))
  );

drop policy if exists "Owner full access" on public.payments;
create policy "Owner full access" on public.payments
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.patients p
                where p.id = payments.patient_id and p.owner_id = (select auth.uid()))
    and (payments.visit_id is null or exists (
          select 1 from public.visits v
          where v.id = payments.visit_id and v.owner_id = (select auth.uid())
            and v.patient_id = payments.patient_id))
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

drop policy if exists "Owner full access" on public.reminder_log;
create policy "Owner full access" on public.reminder_log
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owner full access" on public.expenses;
create policy "Owner full access" on public.expenses
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (expenses.patient_id is null or exists (
          select 1 from public.patients p
          where p.id = expenses.patient_id and p.owner_id = (select auth.uid())))
    and (expenses.treatment_item_id is null or exists (
          select 1 from public.treatment_items t
          where t.id = expenses.treatment_item_id and t.owner_id = (select auth.uid())
            and (expenses.patient_id is null or t.patient_id = expenses.patient_id)))
    and (expenses.recurring_expense_id is null or exists (
          select 1 from public.recurring_expenses r
          where r.id = expenses.recurring_expense_id and r.owner_id = (select auth.uid())))
  );

drop policy if exists "Owner full access" on public.recurring_expenses;
create policy "Owner full access" on public.recurring_expenses
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owner full access" on public.day_closes;
create policy "Owner full access" on public.day_closes
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- app_config is read-only from the app; change it in the SQL Editor
drop policy if exists "Owner reads config" on public.app_config;
create policy "Owner reads config" on public.app_config
  for select to authenticated
  using (clinic_owner_id = (select auth.uid()));

revoke all on
  public.treatment_items, public.visit_charges, public.payments, public.share_links,
  public.appointments, public.booking_requests, public.reminder_log, public.expenses,
  public.recurring_expenses, public.day_closes, public.app_config
from anon;

grant select, insert, update, delete on
  public.treatment_items, public.visit_charges, public.payments, public.share_links,
  public.appointments, public.booking_requests, public.reminder_log, public.expenses,
  public.recurring_expenses, public.day_closes
to authenticated;

revoke all on public.app_config from authenticated;
grant select on public.app_config to authenticated;

-- Website booking: the only way the public can write anything ----------------
-- Called from the website with the publishable key:
--   supabase.rpc('submit_booking_request', { p_name, p_phone, p_area, p_city, p_reason,
--     p_preferred_date, p_preferred_time, p_notes, p_is_emergency })
-- Returns the new request id. Every failure raises an exception (HTTP 400 via
-- PostgREST) whose message is written to be shown to the visitor as-is.
create or replace function public.submit_booking_request(
  p_name text,
  p_phone text,
  p_area text,
  p_city text,
  p_reason text,
  p_preferred_date date,
  p_preferred_time text,
  p_notes text,
  p_is_emergency boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_id uuid;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_name text := btrim(coalesce(p_name, ''), E' \t\r\n');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_area text := nullif(btrim(coalesce(p_area, ''), E' \t\r\n'), '');
  v_city text := nullif(btrim(coalesce(p_city, ''), E' \t\r\n'), '');
  v_reason text := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
  v_time text := nullif(btrim(coalesce(p_preferred_time, ''), E' \t\r\n'), '');
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
  if char_length(v_area) > 100 or char_length(v_city) > 100 then
    raise exception 'Area and city must be 100 characters or fewer.';
  end if;
  if char_length(v_reason) > 200 then
    raise exception 'Reason must be 200 characters or fewer.';
  end if;
  if char_length(v_time) > 20 then
    raise exception 'Preferred time is too long.';
  end if;
  if char_length(v_notes) > 1000 then
    raise exception 'Notes must be 1000 characters or fewer.';
  end if;
  if p_preferred_date is not null
     and (p_preferred_date < v_today or p_preferred_date > v_today + 90) then
    raise exception 'Please choose a date between today and 90 days from now.';
  end if;

  select c.clinic_owner_id into v_owner from public.app_config c where c.id;
  if v_owner is null then
    raise exception 'Online booking is not set up yet. Please call or WhatsApp the clinic.';
  end if;

  -- Rate limits. The lock makes concurrent submissions count one at a time.
  perform pg_advisory_xact_lock(hashtext('public.submit_booking_request'));
  if (select count(*) from public.booking_requests b
      where b.phone = v_phone and b.created_at > now() - interval '24 hours') >= 3 then
    raise exception 'We already have your requests from this number today. The clinic will contact you soon, or please call or WhatsApp the clinic.';
  end if;
  if v_ip is not null and (select count(*) from public.booking_requests b
      where b.client_ip = v_ip and b.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'We already have several requests from this device today. Please call or WhatsApp the clinic.';
  end if;
  if (select count(*) from public.booking_requests b
      where b.created_at > now() - interval '24 hours') >= 200 then
    raise exception 'Online booking is busy right now. Please call or WhatsApp the clinic.';
  end if;

  insert into public.booking_requests (
    owner_id, name, phone, area, city, reason, preferred_date, preferred_time,
    notes, is_emergency, client_ip, status
  )
  values (
    v_owner, v_name, v_phone, v_area, v_city, v_reason, p_preferred_date, v_time,
    v_notes, coalesce(p_is_emergency, false), v_ip, 'new'
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_booking_request(text, text, text, text, text, date, text, text, boolean) from public, anon, authenticated;
grant execute on function public.submit_booking_request(text, text, text, text, text, date, text, text, boolean) to anon, authenticated;

-- Receipt storage: private bucket, files stored under <owner id>/ -------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Owner reads own expense receipts" on storage.objects;
create policy "Owner reads own expense receipts" on storage.objects
  for select to authenticated
  using (bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owner uploads own expense receipts" on storage.objects;
create policy "Owner uploads own expense receipts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owner deletes own expense receipts" on storage.objects;
create policy "Owner deletes own expense receipts" on storage.objects
  for delete to authenticated
  using (bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Make the new tables and function visible to the app straight away
notify pgrst, 'reload schema';
