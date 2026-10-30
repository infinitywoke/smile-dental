-- Multi-clinic, slice 4 of docs/build/PLAN-multi-clinic.md (owner, 30 Oct 2026): the public side per clinic.
-- Until now the website's free times, its requests, the booking pause, the price list it shows and the
-- notifications all found "the clinic" through app_config's one login. Now:
--   - each clinic's website names it by its slug: get_open_slots, booking_paused_until, submit_booking_request
--     and public_price_list each take p_clinic and read that clinic's appointments, time off, held requests,
--     pause and price list. A request lands in that clinic (its owner's), and the phone, device and busy limits
--     count per clinic;
--   - the booking pause belongs to the clinic (clinics.booking_paused_until), set by any of its members;
--   - notifications reach every member of the clinic who has a phone set up, each with their own settings and
--     once-only log: notify_new_request_all and notify_due_all return one payload a member;
--   - the versions without a slug, and notify_new_request and notify_due, keep working for Smile Dental Clinic
--     (app_config's) until the app has moved to these. Then they go, with app_config (slice 4's clean-up).
-- Additive. Folded into schema.sql.

begin;

-- On the live database: wait at most 10 seconds for a table the app is using, then stop with nothing changed
set local lock_timeout = '10s';

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

commit;
