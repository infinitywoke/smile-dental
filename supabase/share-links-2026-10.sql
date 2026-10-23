-- The short prescription link (owner, 23 Oct 2026: "let's do the short prescription link", only where
-- photos can't be sent as files, and "Yes, add it" to this change). Additive: one column on the kept
-- share_links table, one function anyone with a link may call, and the nightly tidy-up also clears links
-- that ran out a month ago. Nothing is changed or removed, so the app as it is keeps working while this
-- runs. Safe to run again.

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

-- The nightly tidy-up (supabase/records-2026-10.sql), now also clearing links that ran out a month ago
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

notify pgrst, 'reload schema';
