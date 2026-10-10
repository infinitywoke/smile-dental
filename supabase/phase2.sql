-- Phase 2: patients, visits and visit photos
-- Run in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.

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

-- Patients ------------------------------------------------------------------
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,                 -- 10-digit Indian mobile, digits only
  date_of_birth date,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visits_owner_date_idx on public.visits (owner_id, visit_date desc, created_at desc);
create index if not exists visits_patient_idx on public.visits (patient_id, visit_date desc, created_at desc);

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

-- Access: only the signed-in owner can see or change their own rows ---------
alter table public.patients enable row level security;
alter table public.visits enable row level security;
alter table public.visit_photos enable row level security;

drop policy if exists "Owner full access" on public.patients;
create policy "Owner full access" on public.patients
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owner full access" on public.visits;
create policy "Owner full access" on public.visits
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owner full access" on public.visit_photos;
create policy "Owner full access" on public.visit_photos
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.patients, public.visits, public.visit_photos from anon;
grant select, insert, update, delete on public.patients, public.visits, public.visit_photos to authenticated;

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

-- Make the new tables visible to the app straight away
notify pgrst, 'reload schema';
