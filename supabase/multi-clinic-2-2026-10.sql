-- Multi-clinic, slice 2a of docs/build/PLAN-multi-clinic.md (owner, 30 Oct 2026: "continue building"): access
-- by clinic. Everyone who works at a clinic reads and writes its rows; a new row is its maker's (owner_id) and
-- its clinic's (clinic_id). Each clinic has one member today, so nobody sees more or less than before: the guard
-- below checks that login by login on the live data, and undoes the change otherwise.
--   - Rules on the 17 clinic tables: the row is in the signed-in person's clinic; a new row is theirs; what a
--     row points at (a visit's patient, a charge's visit, a move's item...) is in the same clinic.
--   - The clinic's files (photos, recordings, bills): its own folder (<clinic id>/...) or a member's
--     (<user id>/..., where the app puts them until slice 2b). Request voice notes go by the request's clinic.
--   - By clinic too: confirming a website request, loading the price list and the list the website reads, the
--     appointment time check, a charge's materials, and no two booked appointments overlapping.
--   - One per clinic: Tally settings, a material per charge, a stock item's name, a price-list option (beside
--     the per-person keys, which go once the app has moved to these, slice 2b).
--   - The clinic is filled in first, before the checks that read it (a table's triggers fire in name order).
--   - clinic_id is required, and a login with records can't be deleted: records outlive the login that made them.
-- Still found through app_config's login until slice 4 moves them to the clinic (before slice 5 lets a second
-- person sign in): the website's free times and requests, and the notifications. Folded into schema.sql.

begin;

-- On the live database: wait at most 10 seconds for a table the app is using, then stop with nothing changed
set local lock_timeout = '10s';

-- Guard (this file only): what each login sees now, table by table and file bucket by file bucket, to compare
-- with what it sees at the end
create temp table slice2_seen (user_id uuid, what text, before bigint, after bigint, primary key (user_id, what)) on commit drop;
insert into slice2_seen (user_id, what)
select u.id, w.what from auth.users u cross join (values
  ('patients'), ('visits'), ('visit_photos'), ('visit_charges'), ('payments'), ('share_links'), ('appointments'),
  ('time_off'), ('booking_requests'), ('visit_recordings'), ('tally_settings'), ('fixed_costs'), ('costs'),
  ('stock_items'), ('stock_moves'), ('treatment_materials'), ('price_list'),
  ('files:visit-photos'), ('files:visit-audio'), ('files:cost-bills'), ('files:request-voice')) w(what);

-- How many rows (or files) a login sees, as that login
create or replace function pg_temp.slice2_count(p_user uuid, p_what text)
returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('role', 'authenticated', true);
  if p_what like 'files:%' then
    execute 'select count(*) from storage.objects where bucket_id = $1' into n using substr(p_what, 7);
  else
    execute format('select count(*) from public.%I', p_what) into n;
  end if;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return n;
end;
$$;

update slice2_seen set before = pg_temp.slice2_count(user_id, what);

-- The clinic's own folder, or a member's: is this folder one of the signed-in person's clinic? -------------
create or replace function public.is_clinic_folder(p_folder text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_folder = (select public.my_clinic_id())::text
      or exists (select 1 from public.clinic_members m
                 where m.clinic_id = (select public.my_clinic_id()) and m.user_id::text = p_folder)
$$;

revoke all on function public.is_clinic_folder(text) from public, anon;
grant execute on function public.is_clinic_folder(text) to authenticated;

-- Every clinic table: a clinic required, records outlive their maker, the clinic filled in first, and a new
-- row is its maker's ---------------------------------------------------------------------------------------
do $$
declare
  t text;
  c record;
begin
  foreach t in array array[
    'patients', 'visits', 'visit_photos', 'visit_charges', 'payments', 'share_links', 'appointments',
    'time_off', 'booking_requests', 'visit_recordings', 'tally_settings', 'fixed_costs', 'costs',
    'stock_items', 'stock_moves', 'treatment_materials', 'price_list'
  ] loop
    execute format('alter table public.%I alter column clinic_id set not null', t);
    -- Deleting a login with records is refused (it deleted them before)
    for c in select k.conname from pg_constraint k
             where k.conrelid = format('public.%I', t)::regclass and k.contype = 'f'
               and k.confrelid = 'auth.users'::regclass and k.confdeltype <> 'r' loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    if not exists (select 1 from pg_constraint k where k.conrelid = format('public.%I', t)::regclass
                   and k.contype = 'f' and k.confrelid = 'auth.users'::regclass) then
      execute format('alter table public.%I add constraint %I foreign key (owner_id) references auth.users (id) on delete restrict', t, t || '_owner_id_fkey');
    end if;
    -- A table's triggers fire in name order, and "0" comes before any letter
    execute format('drop trigger if exists %I on public.%I', t || '_fill_clinic', t);
    execute format('create or replace trigger "0_fill_clinic" before insert on public.%I for each row execute function public.fill_clinic_id()', t);
    execute format('drop policy if exists "New rows are their maker''s" on public.%I', t);
    execute format('create policy "New rows are their maker''s" on public.%I as restrictive for insert to authenticated with check (owner_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Who reads and writes the clinic's rows: its members --------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['patients', 'time_off', 'tally_settings', 'fixed_costs', 'costs', 'stock_items', 'price_list'] loop
    execute format('drop policy if exists "Owner full access" on public.%I', t);
    execute format('drop policy if exists "Clinic members" on public.%I', t);
    execute format('create policy "Clinic members" on public.%I for all to authenticated using (clinic_id = (select public.my_clinic_id())) with check (clinic_id = (select public.my_clinic_id()))', t);
  end loop;
end;
$$;

-- What a row points at is in the same clinic: a visit's patient, a photo's or a charge's visit (and the
-- visit's patient), a move's item...
drop policy if exists "Owner full access" on public.visits;
drop policy if exists "Clinic members" on public.visits;
create policy "Clinic members" on public.visits
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.patients p where p.id = visits.patient_id and p.clinic_id = visits.clinic_id)
  );

-- A photo's file is in its visit's folder, under the clinic's folder or a member's
drop policy if exists "Owner full access" on public.visit_photos;
drop policy if exists "Clinic members" on public.visit_photos;
create policy "Clinic members" on public.visit_photos
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.visits v where v.id = visit_photos.visit_id and v.clinic_id = visit_photos.clinic_id)
    and split_part(visit_photos.storage_path, '/', 2) = visit_photos.visit_id::text
    and split_part(visit_photos.storage_path, '/', 3) <> ''
    and public.is_clinic_folder(split_part(visit_photos.storage_path, '/', 1))
  );

drop policy if exists "Owner full access" on public.visit_charges;
drop policy if exists "Clinic members" on public.visit_charges;
create policy "Clinic members" on public.visit_charges
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.visits v
                where v.id = visit_charges.visit_id and v.clinic_id = visit_charges.clinic_id
                  and v.patient_id = visit_charges.patient_id)
  );

drop policy if exists "Owner full access" on public.payments;
drop policy if exists "Clinic members" on public.payments;
create policy "Clinic members" on public.payments
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.visits v
                where v.id = payments.visit_id and v.clinic_id = payments.clinic_id
                  and v.patient_id = payments.patient_id)
  );

drop policy if exists "Owner full access" on public.share_links;
drop policy if exists "Clinic members" on public.share_links;
create policy "Clinic members" on public.share_links
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.visits v where v.id = share_links.visit_id and v.clinic_id = share_links.clinic_id)
  );

drop policy if exists "Owner full access" on public.appointments;
drop policy if exists "Clinic members" on public.appointments;
create policy "Clinic members" on public.appointments
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.patients p where p.id = appointments.patient_id and p.clinic_id = appointments.clinic_id)
    and (appointments.from_visit_id is null or exists (
          select 1 from public.visits v
          where v.id = appointments.from_visit_id and v.clinic_id = appointments.clinic_id
            and v.patient_id = appointments.patient_id))
    and (appointments.visit_id is null or exists (
          select 1 from public.visits v
          where v.id = appointments.visit_id and v.clinic_id = appointments.clinic_id
            and v.patient_id = appointments.patient_id))
  );

drop policy if exists "Owner full access" on public.booking_requests;
drop policy if exists "Clinic members" on public.booking_requests;
create policy "Clinic members" on public.booking_requests
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and (booking_requests.patient_id is null or exists (
          select 1 from public.patients p
          where p.id = booking_requests.patient_id and p.clinic_id = booking_requests.clinic_id))
    and (booking_requests.appointment_id is null or exists (
          select 1 from public.appointments a
          where a.id = booking_requests.appointment_id and a.clinic_id = booking_requests.clinic_id))
  );

drop policy if exists "Owner full access" on public.visit_recordings;
drop policy if exists "Clinic members" on public.visit_recordings;
create policy "Clinic members" on public.visit_recordings
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.visits v where v.id = visit_recordings.visit_id and v.clinic_id = visit_recordings.clinic_id)
    and split_part(visit_recordings.storage_path, '/', 2) = visit_recordings.visit_id::text
    and split_part(visit_recordings.storage_path, '/', 3) <> ''
    and public.is_clinic_folder(split_part(visit_recordings.storage_path, '/', 1))
  );

drop policy if exists "Owner full access" on public.stock_moves;
drop policy if exists "Clinic members" on public.stock_moves;
create policy "Clinic members" on public.stock_moves
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.stock_items i where i.id = stock_moves.item_id and i.clinic_id = stock_moves.clinic_id)
  );

drop policy if exists "Owner full access" on public.treatment_materials;
drop policy if exists "Clinic members" on public.treatment_materials;
create policy "Clinic members" on public.treatment_materials
  for all to authenticated
  using (clinic_id = (select public.my_clinic_id()))
  with check (
    clinic_id = (select public.my_clinic_id())
    and exists (select 1 from public.stock_items i where i.id = treatment_materials.item_id and i.clinic_id = treatment_materials.clinic_id)
  );

-- The clinic's files: read and delete in the clinic's folder or a member's; upload to the clinic's or one's own --
do $$
declare
  b record;
begin
  for b in select * from (values
    ('visit-photos', 'visit photos', 'Owner reads own visit photos', 'Owner uploads own visit photos', 'Owner deletes own visit photos'),
    ('visit-audio', 'visit recordings', 'Owner plays own visit recordings', 'Owner uploads own visit recordings', 'Owner deletes own visit recordings'),
    ('cost-bills', 'bills', 'Owner reads own bills', 'Owner uploads own bills', 'Owner deletes own bills')
  ) v(bucket, what, old_read, old_upload, old_delete) loop
    execute format('drop policy if exists %I on storage.objects', b.old_read);
    execute format('drop policy if exists %I on storage.objects', b.old_upload);
    execute format('drop policy if exists %I on storage.objects', b.old_delete);
    execute format('drop policy if exists %I on storage.objects', 'Clinic reads its ' || b.what);
    execute format('drop policy if exists %I on storage.objects', 'Clinic uploads ' || b.what);
    execute format('drop policy if exists %I on storage.objects', 'Clinic deletes its ' || b.what);
    execute format('create policy %I on storage.objects for select to authenticated using (bucket_id = %L and public.is_clinic_folder((storage.foldername(name))[1]))',
                   'Clinic reads its ' || b.what, b.bucket);
    execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and (storage.foldername(name))[1] in ((select public.my_clinic_id())::text, (select auth.uid())::text))',
                   'Clinic uploads ' || b.what, b.bucket);
    execute format('create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and public.is_clinic_folder((storage.foldername(name))[1]))',
                   'Clinic deletes its ' || b.what, b.bucket);
  end loop;
end;
$$;

-- A website request's voice note: the request's clinic plays and deletes it
drop policy if exists "Owner plays request voice notes" on storage.objects;
drop policy if exists "Clinic plays request voice notes" on storage.objects;
create policy "Clinic plays request voice notes" on storage.objects
  for select to authenticated
  using (bucket_id = 'request-voice' and exists (
    select 1 from public.booking_requests b
    where b.id::text = split_part(storage.objects.name, '.', 1) and b.clinic_id = (select public.my_clinic_id())));

drop policy if exists "Owner deletes request voice notes" on storage.objects;
drop policy if exists "Clinic deletes request voice notes" on storage.objects;
create policy "Clinic deletes request voice notes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'request-voice' and exists (
    select 1 from public.booking_requests b
    where b.id::text = split_part(storage.objects.name, '.', 1) and b.clinic_id = (select public.my_clinic_id())));

-- No two booked appointments overlap in a clinic (it was per login) -------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint k where k.conrelid = 'public.appointments'::regclass
             and k.conname = 'appointments_no_overlap' and pg_get_constraintdef(k.oid) like '%owner_id%') then
    alter table public.appointments drop constraint appointments_no_overlap;
  end if;
  alter table public.appointments
    add constraint appointments_no_overlap
    exclude using gist (
      clinic_id with =,
      tstzrange(starts_at, public.appointment_end(starts_at, duration_min)) with &&
    ) where (status = 'booked');
exception when duplicate_object or duplicate_table then null;
end;
$$;

-- An appointment can't be in the clinic's time off (the clinic is filled in before this runs)
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
                 and tstzrange(t.starts_at, t.ends_at)
                     && tstzrange(new.starts_at, public.appointment_end(new.starts_at, new.duration_min))) then
      raise exception 'That time is blocked off in your calendar.';
    end if;
  end if;
  return new;
end;
$$;

-- A charge from the price list takes the clinic's materials for it off stock
create or replace function public.use_materials_for_charge()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.treatment_slug is not null then
    insert into public.stock_moves (owner_id, item_id, kind, qty, charge_id, note)
    select new.owner_id, tm.item_id, 'use', -tm.qty, new.id, left(new.description, 200)
    from public.treatment_materials tm
    where tm.clinic_id = new.clinic_id and tm.treatment_slug = new.treatment_slug and tm.charge_description = new.description;
  end if;
  return new;
end;
$$;

-- Confirming a website request: the clinic's request, time off and patient (as before, by login)
create or replace function public.confirm_booking_request(
  p_request uuid,
  p_starts_at timestamptz,
  p_patient uuid default null,
  p_minutes integer default 30
)
returns table (patient_id uuid, appointment_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.booking_requests;
  v_patient uuid;
  v_appointment uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Please sign in.';
  end if;

  select * into r from public.booking_requests b
  where b.id = p_request and b.clinic_id = (select public.my_clinic_id())
  for update;
  if not found then
    raise exception 'That request was not found.';
  end if;
  if r.status not in ('new', 'contacted') then
    raise exception 'This request has already been handled.';
  end if;

  if not public.is_clinic_start(p_starts_at, p_minutes) then
    raise exception 'Please choose one of the clinic time blocks (the clinic is closed on Fridays).';
  end if;
  if public.appointment_end(p_starts_at, p_minutes) <= public.clinic_now() then
    raise exception 'That time has already passed.';
  end if;
  if exists (select 1 from public.time_off t
             where t.clinic_id = r.clinic_id
               and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, public.appointment_end(p_starts_at, p_minutes))) then
    raise exception 'That time is blocked off in your calendar.';
  end if;

  if p_patient is not null then
    select p.id into v_patient from public.patients p
    where p.id = p_patient and p.clinic_id = r.clinic_id;
    if v_patient is null then
      raise exception 'That patient was not found.';
    end if;
    if nullif(btrim(r.medical_alerts), '') is not null then
      update public.patients p
      set medical_alerts = case
        when nullif(btrim(p.medical_alerts), '') is null then r.medical_alerts
        when position(lower(btrim(r.medical_alerts)) in lower(p.medical_alerts)) > 0 then p.medical_alerts
        else p.medical_alerts || E'\n' || r.medical_alerts
             || ' (website, ' || to_char(r.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') || ')'
      end
      where p.id = v_patient;
    end if;
  else
    insert into public.patients (name, phone, gender, birth_year, address, medical_alerts, heard_from)
    values (r.name, r.phone, r.gender, r.birth_year, r.address, r.medical_alerts, r.heard_from)
    returning id into v_patient;
  end if;

  begin
    insert into public.appointments (patient_id, starts_at, duration_min, reason, status)
    values (
      v_patient, p_starts_at, p_minutes,
      coalesce(nullif(concat_ws(' - ', r.reason, r.notes), ''), ''),
      'booked'
    )
    returning id into v_appointment;
  exception when exclusion_violation then
    raise exception 'That time was just taken. Please choose another block.';
  end;

  update public.booking_requests b
  set status = 'booked', patient_id = v_patient, appointment_id = v_appointment
  where b.id = r.id;

  return query select v_patient, v_appointment;
end;
$$;

-- Loading the sheet: the clinic's whole list replaced at once, or not at all
create or replace function public.replace_price_list(p_items jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select public.my_clinic_id()) is null then
    raise exception 'Not signed in';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'A price list has 1 to 500 lines';
  end if;
  delete from public.price_list where clinic_id = (select public.my_clinic_id());
  insert into public.price_list (owner_id, line_no, slug, treatment, description, detail, cost)
  select (select auth.uid()), i.ord::integer, i.item->>'slug', i.item->>'treatment',
         coalesce(i.item->>'description', ''), coalesce(i.item->>'detail', ''), i.item->>'cost'
  from jsonb_array_elements(p_items) with ordinality as i(item, ord);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The list the website reads: the clinic's (still found through app_config's login until slice 4)
create or replace function public.public_price_list()
returns table (line_no integer, slug text, treatment text, description text, detail text, cost text)
language sql stable security definer set search_path = ''
as $$
  select p.line_no, p.slug, p.treatment, p.description, p.detail, p.cost
  from public.price_list p
  where p.clinic_id = (select m.clinic_id from public.clinic_members m
                       join public.app_config c on c.id and m.user_id = c.clinic_owner_id
                       order by m.created_at, m.clinic_id limit 1)
  order by p.line_no
$$;

-- One per clinic, beside the per-person keys the app still names (they go in slice 2b) -----------------------
create unique index if not exists tally_settings_one_per_clinic on public.tally_settings (clinic_id);
create unique index if not exists treatment_materials_once_per_clinic
  on public.treatment_materials (clinic_id, treatment_slug, charge_description, item_id);
create unique index if not exists stock_items_clinic_name on public.stock_items (clinic_id, lower(name)) where not archived;
create unique index if not exists price_list_once_per_clinic on public.price_list (clinic_id, treatment, detail);

-- The guard's end: each login sees what it saw before, row for row and file for file; otherwise all is undone
update slice2_seen set after = pg_temp.slice2_count(user_id, what);
do $$
declare
  r record;
begin
  for r in select * from slice2_seen where before is distinct from after order by what loop
    raise exception 'Stopped, nothing changed: login % would see % in % instead of %', r.user_id, r.after, r.what, r.before;
  end loop;
end;
$$;

commit;
