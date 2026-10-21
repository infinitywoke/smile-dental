-- Notifications on the installed Clinic OS (21 Oct 2026). Run once in the Supabase SQL editor.
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

-- LIVE ONLY (the checks in supabase/tests skip everything below) --------------------------------------
-- The scheduler and the web requests it makes
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- The shared secret, made inside the database so nobody types or pastes it except into Vercel
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'clinic_os_cron',
  'Clinic OS: lets the scheduler and the app fetch due notifications')
where not exists (select 1 from vault.secrets where name = 'clinic_os_cron');

-- Every 5 minutes, the scheduler asks the app to send what is due (same name again replaces the job)
select cron.schedule('clinic-os-notify', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://smile-dental-hin3.vercel.app/api/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'clinic_os_cron')),
    body := '{}'::jsonb)
$job$);

-- Then copy the secret into Vercel as CLINIC_OS_CRON_SECRET (Settings, Environment Variables):
--   select decrypted_secret from vault.decrypted_secrets where name = 'clinic_os_cron';
