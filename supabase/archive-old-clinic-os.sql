-- Moves the OLD Clinic OS tables, views and functions out of the way into a private
-- "old_clinic_os" schema. Nothing is deleted: every row is kept and can be inspected
-- (or moved back) later. The archive is not reachable through the app or the public API.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Then run phase2.sql.

create schema if not exists old_clinic_os;
revoke all on schema old_clinic_os from public, anon, authenticated;

do $$
declare
  r record;
begin
  -- Tables and views (skipping anything that belongs to an extension, and the new app's tables)
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
      and c.relname not in ('visits', 'visit_photos')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
  loop
    execute format(
      'alter %s public.%I set schema old_clinic_os',
      case r.relkind when 'v' then 'view' when 'm' then 'materialized view' else 'table' end,
      r.relname
    );
  end loop;

  -- Functions (old RPCs, triggers, test helpers), except the new app's own helper
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and p.proname <> 'set_updated_at'
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
    execute format('alter routine %s set schema old_clinic_os', r.signature);
  end loop;
end
$$;

notify pgrst, 'reload schema';

-- Show what is now in the archive
select table_name from information_schema.tables where table_schema = 'old_clinic_os' order by table_name;
