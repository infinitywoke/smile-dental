-- Patient voice notes on website requests (owner, 15 Oct 2026): a test of two ways for a patient to
-- describe their problem, so Dr. Rahil can judge how much time to give them.
--   'page':     a short recording on the booking page, attached to the request (private bucket)
--   'whatsapp': the page asks for a WhatsApp voice note after Send (nothing is uploaded)
-- A visitor may attach one note, only to a request made in the last 15 minutes, audio only, at most
-- 1 MB. Only the clinic owner can play or delete it. Additive and safe to run twice.

begin;

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

commit;

notify pgrst, 'reload schema';
