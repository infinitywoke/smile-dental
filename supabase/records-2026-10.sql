-- Error alerts, the access log, consent, each patient's message language and the nightly tidy-up (owner,
-- 23 Oct 2026: "Yes to all"). Additive: new tables, new columns and a new function, nothing removed or
-- changed, so the app as it is keeps working while this runs. Safe to run again.

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
  delete from public.booking_requests
  where status <> 'booked' and created_at < now() - interval '6 months'
  returning voice_note;
$$;
revoke all on function public.tidy_old_records() from public, anon, authenticated;

notify pgrst, 'reload schema';
