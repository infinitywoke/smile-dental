-- Multi-clinic, slice 1 of docs/build/PLAN-multi-clinic.md (owner, 30 Oct 2026: "Let's continue building").
-- Clinic OS becomes one service for many clinics: a clinic is the unit, and the people who work there (the
-- dentist; later assistants and visiting specialists) are its members. This slice only adds:
--   - clinics and their members, and two helpers: my_clinic_id() and is_clinic_member();
--   - every existing login becomes the owner of a clinic of its own (the one in app_config is Smile Dental
--     Clinic);
--   - a clinic on every clinic-data row: existing rows filled from the row's owner (with the table's own
--     triggers off, so a fill is not a bill change, an appointment re-check or a new updated_at), and new rows
--     filled by a trigger from their owner, whoever inserts them (the app, the website's booking, the scheduler).
-- Who sees what does not change yet (each login still sees its own rows); slice 2 switches access to the
-- members of the row's clinic. Additive and safe to run twice. Folded into schema.sql.

begin;

-- On the live database: wait at most 10 seconds for a table the app is using, then stop with nothing changed
-- (run it again), so the app is never held up for long
set local lock_timeout = '10s';

-- Live-database guard (this file only, not schema.sql). The 17 clinic tables are this change's alone until it
-- ends (a fraction of a second), and what every row holds now is noted, all but its clinic. At the end nothing
-- else may have changed and no row may be without a clinic; otherwise the whole change is undone.
create temp table slice1_rows (t text primary key, before text) on commit drop;
insert into slice1_rows (t) values
  ('patients'), ('visits'), ('visit_photos'), ('visit_charges'), ('payments'), ('share_links'), ('appointments'),
  ('time_off'), ('booking_requests'), ('visit_recordings'), ('tally_settings'), ('fixed_costs'), ('costs'),
  ('stock_items'), ('stock_moves'), ('treatment_materials'), ('price_list');
create or replace function pg_temp.slice1_rows_now(p_table text)
returns text
language plpgsql
as $$
declare
  f text;
begin
  execute format($q$select count(*) || ':' || md5(coalesce(string_agg((to_jsonb(x) - 'clinic_id')::text, ',' order by (to_jsonb(x) - 'clinic_id')::text), '')) from public.%I x$q$, p_table)
  into f;
  return f;
end;
$$;
do $$
begin
  execute (select 'lock table ' || string_agg(format('public.%I', t), ', ') || ' in access exclusive mode' from pg_temp.slice1_rows);
  update pg_temp.slice1_rows set before = pg_temp.slice1_rows_now(t);
end;
$$;

-- Clinics, and who works at each ----------------------------------------------------------------------
create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  -- Public and stable: the website's booking will name its clinic by this
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.clinic_members (
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'dentist', 'assistant')),
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index if not exists clinic_members_user_idx on public.clinic_members (user_id);

-- The clinic the signed-in person works in (the first they joined), or null
create or replace function public.my_clinic_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.clinic_id from public.clinic_members m
  where m.user_id = (select auth.uid())
  order by m.created_at, m.clinic_id
  limit 1
$$;

create or replace function public.is_clinic_member(p_clinic uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.clinic_members m where m.clinic_id = p_clinic and m.user_id = (select auth.uid()))
$$;

revoke all on function public.my_clinic_id() from public, anon;
revoke all on function public.is_clinic_member(uuid) from public, anon;
grant execute on function public.my_clinic_id() to authenticated;
grant execute on function public.is_clinic_member(uuid) to authenticated;

-- Members read their clinic and its members; clinics and members are set up by the operator, not the app
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
drop policy if exists "Members read their clinic" on public.clinics;
create policy "Members read their clinic" on public.clinics
  for select to authenticated
  using (public.is_clinic_member(id));
drop policy if exists "Members read their clinic's members" on public.clinic_members;
create policy "Members read their clinic's members" on public.clinic_members
  for select to authenticated
  using (public.is_clinic_member(clinic_id));
revoke all on public.clinics, public.clinic_members from anon, authenticated;
grant select on public.clinics, public.clinic_members to authenticated;

-- Every login without a clinic becomes the owner of one of its own. The clinic in app_config (the one the
-- website books into) is Smile Dental Clinic; any other is a new clinic, named later in its settings.
with owners as materialized (
  select u.id as user_id,
         gen_random_uuid() as clinic_id,
         (u.id = cfg.owner_id) as is_main
  from auth.users u
  left join (select c.clinic_owner_id as owner_id from public.app_config c where c.id) cfg on true
  where not exists (select 1 from public.clinic_members m where m.user_id = u.id)
), made as (
  insert into public.clinics (id, slug, name)
  select o.clinic_id,
         case when o.is_main and not exists (select 1 from public.clinics c where c.slug = 'smile-dental-katapadi')
              then 'smile-dental-katapadi' else 'clinic-' || left(replace(o.clinic_id::text, '-', ''), 12) end,
         case when o.is_main then 'Smile Dental Clinic' else 'New clinic' end
  from owners o
  returning id
)
insert into public.clinic_members (clinic_id, user_id, role)
select o.clinic_id, o.user_id, 'owner' from owners o;

-- A new row's clinic: its owner's (the clinic they work in), unless the row names one
create or replace function public.fill_clinic_id()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.clinic_id is null then
    select m.clinic_id into new.clinic_id
    from public.clinic_members m
    where m.user_id = new.owner_id
    order by m.created_at, m.clinic_id
    limit 1;
  end if;
  return new;
end;
$$;

-- A clinic on every clinic-data row ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'patients', 'visits', 'visit_photos', 'visit_charges', 'payments', 'share_links', 'appointments',
    'time_off', 'booking_requests', 'visit_recordings', 'tally_settings', 'fixed_costs', 'costs',
    'stock_items', 'stock_moves', 'treatment_materials', 'price_list'
  ] loop
    -- A clinic with records cannot be deleted by mistake: its records have to be removed first, on purpose
    execute format('alter table public.%I add column if not exists clinic_id uuid references public.clinics (id) on delete restrict', t);
    execute format('create index if not exists %I on public.%I (clinic_id)', t || '_clinic_idx', t);
    -- Existing rows: their owner's clinic, with the table's own triggers off (a fill is not a change to a
    -- bill, an appointment or the row's updated_at)
    execute format('alter table public.%I disable trigger user', t);
    execute format(
      'update public.%I x set clinic_id = m.clinic_id
       from (select distinct on (user_id) user_id, clinic_id from public.clinic_members order by user_id, created_at, clinic_id) m
       where x.clinic_id is null and x.owner_id = m.user_id', t);
    execute format('alter table public.%I enable trigger user', t);
    -- New rows: filled from their owner, whoever inserts them
    execute format('create or replace trigger %I before insert on public.%I for each row execute function public.fill_clinic_id()', t || '_fill_clinic', t);
  end loop;
end;
$$;

-- The guard's end: nothing but the clinic changed, no row is without one, and no trigger was left off
do $$
declare
  r record;
  n bigint;
begin
  for r in select t, before from pg_temp.slice1_rows loop
    if pg_temp.slice1_rows_now(r.t) is distinct from r.before then
      raise exception 'Stopped, nothing changed: rows in % would have changed beyond their clinic', r.t;
    end if;
    execute format('select count(*) from public.%I where clinic_id is null', r.t) into n;
    if n > 0 then
      raise exception 'Stopped, nothing changed: % rows in % would have had no clinic', n, r.t;
    end if;
  end loop;
  if exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace s on s.oid = c.relnamespace
             where s.nspname = 'public' and not g.tgisinternal and g.tgenabled = 'D') then
    raise exception 'Stopped, nothing changed: a trigger would have been left off';
  end if;
end;
$$;

commit;
