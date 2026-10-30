-- Multi-clinic, slice 5's database part (docs/build/PLAN-multi-clinic.md, PLAN-endstate.md; owner, 30 Oct 2026):
-- setting a clinic up, and the demo clinic for showing prospective clinics.
--   - setup_clinic(setup): the operator's one call. It makes the clinic (or updates it, by its slug) with its
--     details, its chairs and dentists, and its members by email. A member's login is made first (Supabase:
--     Authentication, Add user), and nobody gets in without one: the call says whose is missing.
--   - seed_demo_clinic(slug): fills a demo clinic (its slug starts "demo-") with invented patients, today's and
--     tomorrow's appointments, visits with bills and payments, someone who owes, a website request and stock
--     running low, all dated from today, so a demo always looks current. Run again, it starts over: the demo
--     clinic's records only, never another clinic's.
-- Both for the operator only (nobody signed in, not the website). Folded into schema.sql.

begin;

-- On the live database: wait at most 10 seconds for a table the app is using, then stop with nothing changed
set local lock_timeout = '10s';

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
                              review_link, upi_id, upi_payee, logo, tally, chair_monitor)
  values (p->>'slug', p->>'name', p->>'place', p->>'placeKn', p->>'phone', coalesce(p->>'whatsapp', p->>'phone'), p->>'email',
          p->>'address', p->>'shortAddress', p->>'mapsLink', p->>'reviewLink', p->'upi'->>'id', p->'upi'->>'payee', p->>'logo',
          coalesce(p->'tally', '{}'::jsonb), p->'chairMonitor')
  on conflict (slug) do update set
    name = excluded.name, place = excluded.place, place_kn = excluded.place_kn, phone = excluded.phone,
    whatsapp = excluded.whatsapp, email = excluded.email, address = excluded.address, short_address = excluded.short_address,
    maps_link = excluded.maps_link, review_link = excluded.review_link, upi_id = excluded.upi_id, upi_payee = excluded.upi_payee,
    logo = excluded.logo, tally = excluded.tally, chair_monitor = excluded.chair_monitor
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
      registration = v_dentist->>'registration', signature = v_dentist->>'signature', active = true
    where d.clinic_id = v_clinic and d.name = v_dentist->>'name';
    if not found then
      insert into public.dentists (clinic_id, name, user_id, short_name, short_name_kn, qualifications, registration, signature)
      values (v_clinic, v_dentist->>'name', v_user, v_dentist->>'shortName', v_dentist->>'shortNameKn',
              v_dentist->>'qualifications', v_dentist->>'registration', v_dentist->>'signature');
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
    insert into public.patients (owner_id, clinic_id, name, phone, gender, birth_year, consent_at)
    values (v_owner, v_clinic, v_names[i], '90000000' || lpad(i::text, 2, '0'),
            case when i % 2 = 0 then 'male' else 'female' end, 1960 + i * 4, now())
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
