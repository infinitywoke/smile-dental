-- Multi-clinic, slice 7's database part (docs/build/PLAN-endstate.md; owner's decisions, 30 Oct 2026): chairs and
-- dentists in use. With one chair and one dentist, as at Smile Dental Clinic, every rule behaves as before.
--   - dentists.visiting: a visiting specialist, booked by the clinic. They open no online times.
--   - clinics.patients_pick_dentist: each clinic's own rule, default no.
--   - appointments.two_chairs: a dentist running two chairs at once, only ever on purpose. Refused first, marked once
--     confirmed. Never three, and a chair or a patient stays one at a time.
--   - get_open_slots: a time is free while a chair and one of the clinic's own dentists are.
--   - a booking with no dentist named goes to one who is free.
--   - the owner keeps the clinic's chairs and dentists; a login is linked by the operator only.
-- Folded into schema.sql.

begin;

-- On the live database: wait at most 10 seconds for a table the app is using, then stop with nothing changed
set local lock_timeout = '10s';

-- A clinic's team: visiting specialists are booked by the clinic and open no online times of their own
alter table public.dentists add column if not exists visiting boolean not null default false;
-- Whether patients may pick a dentist on the website: each clinic's own rule, decided at set-up
alter table public.clinics add column if not exists patients_pick_dentist boolean not null default false;

-- A dentist runs two chairs at once only deliberately: the booking is marked, and the rule then lets it overlap
alter table public.appointments add column if not exists two_chairs boolean not null default false;
alter table public.appointments drop constraint if exists appointments_dentist_free;
alter table public.appointments
  add constraint appointments_dentist_free
  exclude using gist (
    dentist_id with =,
    tstzrange(starts_at, public.appointment_end(starts_at, duration_min)) with &&
  ) where (status = 'booked' and not two_chairs);

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
    order by exists (select 1 from public.appointments a
                     where a.dentist_id = d.id and a.id is distinct from new.id and a.status = 'booked'
                       and tstzrange(a.starts_at, public.appointment_end(a.starts_at, a.duration_min)) && v_range),
             d.visiting, (d.user_id is not distinct from new.owner_id) desc, d.created_at, d.id
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
    if (select count(*) from public.appointments a
        where a.dentist_id = new.dentist_id and a.id is distinct from new.id and a.status = 'booked'
          and tstzrange(a.starts_at, public.appointment_end(a.starts_at, a.duration_min))
              && tstzrange(new.starts_at, public.appointment_end(new.starts_at, new.duration_min))) >= 2 then
      raise exception 'A dentist can run two chairs at once, not three.';
    end if;
  end if;
  return new;
end;
$$;

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
      select 1 from public.time_off t
      where t.clinic_id = cfg.clinic_id and t.dentist_id is null
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(s.slot, public.appointment_end(s.slot, 30)))
    -- A chair free, and one of the clinic's own dentists (the clinic books its visiting specialists itself), once
    -- the requests holding this time have theirs
    and (select count(*) from public.chairs c
         where c.clinic_id = cfg.clinic_id and c.active
           and not exists (select 1 from public.appointments a
                           where a.chair_id = c.id and a.status = 'booked'
                             and tstzrange(a.starts_at, public.appointment_end(a.starts_at, a.duration_min))
                                 && tstzrange(s.slot, public.appointment_end(s.slot, 30))))
        > (select count(*) from public.booking_requests b
           where b.clinic_id = cfg.clinic_id and b.status = 'new' and b.requested_start is not null
             and b.received_at is not null
             and public.request_hold_until(b.received_at, b.requested_start) > public.clinic_now()
             and tstzrange(b.requested_start, public.appointment_end(b.requested_start, 30))
                 && tstzrange(s.slot, public.appointment_end(s.slot, 30)))
    and (select count(*) from public.dentists d
         where d.clinic_id = cfg.clinic_id and d.active and not d.visiting
           and not exists (select 1 from public.appointments a
                           where a.dentist_id = d.id and a.status = 'booked'
                             and tstzrange(a.starts_at, public.appointment_end(a.starts_at, a.duration_min))
                                 && tstzrange(s.slot, public.appointment_end(s.slot, 30)))
           and not exists (select 1 from public.time_off t
                           where t.dentist_id = d.id
                             and tstzrange(t.starts_at, t.ends_at) && tstzrange(s.slot, public.appointment_end(s.slot, 30))))
        > (select count(*) from public.booking_requests b
           where b.clinic_id = cfg.clinic_id and b.status = 'new' and b.requested_start is not null
             and b.received_at is not null
             and public.request_hold_until(b.received_at, b.requested_start) > public.clinic_now()
             and tstzrange(b.requested_start, public.appointment_end(b.requested_start, 30))
                 && tstzrange(s.slot, public.appointment_end(s.slot, 30)))
  order by s.slot
$$;

revoke all on function public.get_open_slots(text, date, integer) from public, anon, authenticated;
grant execute on function public.get_open_slots(text, date, integer) to anon, authenticated;

-- The clinic's owner keeps its chairs and dentists; a login is linked by the operator only
create or replace function public.is_clinic_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.clinic_members m
                 where m.user_id = (select auth.uid()) and m.clinic_id = public.my_clinic_id() and m.role = 'owner')
$$;
revoke all on function public.is_clinic_owner() from public, anon;
grant execute on function public.is_clinic_owner() to authenticated;

drop policy if exists "Owners add chairs" on public.chairs;
create policy "Owners add chairs" on public.chairs for insert to authenticated
  with check (clinic_id = (select public.my_clinic_id()) and (select public.is_clinic_owner()));
drop policy if exists "Owners change chairs" on public.chairs;
create policy "Owners change chairs" on public.chairs for update to authenticated
  using (clinic_id = (select public.my_clinic_id()) and (select public.is_clinic_owner()))
  with check (clinic_id = (select public.my_clinic_id()));
drop policy if exists "Owners add dentists" on public.dentists;
create policy "Owners add dentists" on public.dentists for insert to authenticated
  with check (clinic_id = (select public.my_clinic_id()) and (select public.is_clinic_owner()));
drop policy if exists "Owners change dentists" on public.dentists;
create policy "Owners change dentists" on public.dentists for update to authenticated
  using (clinic_id = (select public.my_clinic_id()) and (select public.is_clinic_owner()))
  with check (clinic_id = (select public.my_clinic_id()));

revoke all on public.chairs, public.dentists from anon, authenticated;
grant select on public.chairs, public.dentists to authenticated;
grant insert (clinic_id, name), update (name, active) on public.chairs to authenticated;
grant insert (clinic_id, name, short_name, qualifications, registration, visiting),
      update (name, short_name, qualifications, registration, visiting, active) on public.dentists to authenticated;

-- A clinic keeps a chair and a dentist, and nobody is taken off while they have bookings to come
create or replace function public.check_team_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.active and not new.active then
    if tg_table_name = 'chairs' then
      if not exists (select 1 from public.chairs c where c.clinic_id = old.clinic_id and c.active and c.id <> old.id) then
        raise exception 'A clinic needs at least one chair.';
      end if;
      if exists (select 1 from public.appointments a where a.chair_id = old.id and a.status = 'booked'
                 and public.appointment_end(a.starts_at, a.duration_min) > public.clinic_now()) then
        raise exception 'That chair still has bookings. Move them first.';
      end if;
    else
      if not exists (select 1 from public.dentists d where d.clinic_id = old.clinic_id and d.active and d.id <> old.id) then
        raise exception 'A clinic needs at least one dentist.';
      end if;
      if exists (select 1 from public.appointments a where a.dentist_id = old.id and a.status = 'booked'
                 and public.appointment_end(a.starts_at, a.duration_min) > public.clinic_now()) then
        raise exception 'That dentist still has bookings. Move them first.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.check_team_change() from public, anon, authenticated;
drop trigger if exists check_team_change on public.chairs;
create trigger check_team_change before update of active on public.chairs for each row execute function public.check_team_change();
drop trigger if exists check_team_change on public.dentists;
create trigger check_team_change before update of active on public.dentists for each row execute function public.check_team_change();

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
                              review_link, upi_id, upi_payee, logo, tally, chair_monitor, languages)
  values (p->>'slug', p->>'name', p->>'place', p->>'placeKn', p->>'phone', coalesce(p->>'whatsapp', p->>'phone'), p->>'email',
          p->>'address', p->>'shortAddress', p->>'mapsLink', p->>'reviewLink', p->'upi'->>'id', p->'upi'->>'payee', p->>'logo',
          coalesce(p->'tally', '{}'::jsonb), p->'chairMonitor',
          coalesce((select array_agg(l) from jsonb_array_elements_text(p->'languages') l), array['en', 'kn']))
  on conflict (slug) do update set
    name = excluded.name, place = excluded.place, place_kn = excluded.place_kn, phone = excluded.phone,
    whatsapp = excluded.whatsapp, email = excluded.email, address = excluded.address, short_address = excluded.short_address,
    maps_link = excluded.maps_link, review_link = excluded.review_link, upi_id = excluded.upi_id, upi_payee = excluded.upi_payee,
    logo = excluded.logo, tally = excluded.tally, chair_monitor = excluded.chair_monitor, languages = excluded.languages
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
      registration = v_dentist->>'registration', signature = v_dentist->>'signature', active = true,
      visiting = coalesce((v_dentist->>'visiting')::boolean, false)
    where d.clinic_id = v_clinic and d.name = v_dentist->>'name';
    if not found then
      insert into public.dentists (clinic_id, name, user_id, short_name, short_name_kn, qualifications, registration, signature, visiting)
      values (v_clinic, v_dentist->>'name', v_user, v_dentist->>'shortName', v_dentist->>'shortNameKn',
              v_dentist->>'qualifications', v_dentist->>'registration', v_dentist->>'signature',
              coalesce((v_dentist->>'visiting')::boolean, false));
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
  v_visiting uuid;
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
    insert into public.patients (owner_id, clinic_id, name, phone, gender, birth_year, consent_at, language)
    values (v_owner, v_clinic, v_names[i], '90000000' || lpad(i::text, 2, '0'),
            case when i % 2 = 0 then 'male' else 'female' end, 1960 + i * 4, now(),
            case i when 2 then 'kn' when 3 then 'hi' end)
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

  -- Two chairs in use: the visiting specialist's patients, at the same time as the dentist's (when there is one)
  select d.id into v_visiting from public.dentists d where d.clinic_id = v_clinic and d.visiting and d.active order by d.created_at limit 1;
  if v_visiting is not null then
    v_start := (v_day + time '18:00') at time zone 'Asia/Kolkata';
    if v_start > public.clinic_now() then
      insert into public.appointments (owner_id, clinic_id, patient_id, dentist_id, starts_at, duration_min, reason, status)
      values (v_owner, v_clinic, v_patients[7], v_visiting, v_start, 30, 'Braces or aligners', 'booked');
    end if;
    insert into public.appointments (owner_id, clinic_id, patient_id, dentist_id, starts_at, duration_min, reason, status)
    values (v_owner, v_clinic, v_patients[1], v_visiting, (v_next + time '10:00') at time zone 'Asia/Kolkata', 30, 'Braces or aligners', 'booked');
  end if;

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

commit;
