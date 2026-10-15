-- Visit recordings (owner, 15 Oct 2026): the clinic keeps each recorded note, privately, with its visit.
-- Files live in the private bucket visit-audio under <doctor>/<visit>/; only the doctor can play or
-- delete them; a row per recording, removed with its visit (the app removes the files first).
-- Additive and safe to run twice. Folded into supabase/schema.sql.

begin;

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

commit;

notify pgrst, 'reload schema';
