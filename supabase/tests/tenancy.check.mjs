// Checks multi-clinic slice 1 (supabase/multi-clinic-1-2026-10.sql) in a throwaway Postgres (PGlite):
// - the schema with it applies twice, and every login gets a clinic of its own;
// - on the database as it was (the live one), with rows already in it, the change file runs twice and:
//   every login becomes the owner of a clinic (the one in app_config is Smile Dental Clinic); every row of
//   clinic data gets its owner's clinic; nothing else moves (a sent visit is not marked "bill changed", no
//   updated_at changes, an appointment at an old time is left alone);
// - new rows get their owner's clinic, whoever inserts them, and a clinic with records cannot be deleted by
//   mistake; the helpers answer per person; members read their own clinic only, and the website (anon) reads
//   neither table;
// - the change file's guard: if anything but the clinic would change, the change stops and none of it is kept.
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder and run
// it from there (copy this file next to node_modules): node tenancy.check.mjs <path to this repo>
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync } from 'node:fs'

const repo = process.argv[2]
const read = (f) => readFileSync(`${repo}/supabase/${f}`, 'utf8')
const MARKER = '\n-- Multi-clinic, slice 1 (30 Oct 2026'

let failures = 0
let passes = 0
const ok = (name) => { passes++; console.log('PASS', name) }
const bad = (name, e) => { failures++; console.log('FAIL', name, e?.message ?? e) }
const check = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail || 'condition false'))

const A = '11111111-1111-1111-1111-111111111111' // Dr. Rahil (the clinic in app_config)
const B = '22222222-2222-2222-2222-222222222222' // another login (the test account)
const start = async () => {
  const db = new PGlite({ extensions: { btree_gist } })
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    grant usage on schema public, auth, storage to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${A}', 'smiledental8925@gmail.com'), ('${B}', 'test@example.com');
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `)
  return db
}
const rowsOf = async (db, sql) => (await db.query(sql)).rows
const as = async (db, who) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false); set role ${who ? 'authenticated' : 'anon'};`)
const err = async (db, sql) => { try { await db.query(sql); return null } catch (e) { return e.message } }

const TABLES = ['patients', 'visits', 'visit_photos', 'visit_charges', 'payments', 'share_links', 'appointments',
  'time_off', 'booking_requests', 'visit_recordings', 'tally_settings', 'fixed_costs', 'costs', 'stock_items',
  'stock_moves', 'treatment_materials', 'price_list']

// 1. A fresh database: the whole schema, twice
{
  const db = await start()
  try {
    await db.exec(read('schema.sql'))
    await db.exec(read('schema.sql'))
    ok('schema.sql applies twice')
  } catch (e) {
    bad('apply schema.sql twice', e)
  }
  const members = await rowsOf(db, `select m.user_id, m.role, c.slug, c.name from public.clinic_members m join public.clinics c on c.id = m.clinic_id order by m.user_id`)
  check('every login is the owner of one clinic, once', members.length === 2 && members.every((m) => m.role === 'owner'), JSON.stringify(members))
  check("the clinic in app_config is Smile Dental Clinic, at its slug", members[0].slug === 'smile-dental-katapadi' && members[0].name === 'Smile Dental Clinic', JSON.stringify(members[0]))
  for (const t of TABLES) {
    const has = await rowsOf(db, `select 1 from information_schema.columns where table_schema = 'public' and table_name = '${t}' and column_name = 'clinic_id'`)
    if (!has.length) bad(`${t} has clinic_id`, 'missing')
  }
  ok('the 17 clinic-data tables have clinic_id')
}

// 2. The database as it was (the live one), with data in it, then the change file twice
const db = await start()
const before = read('schema.sql').split(MARKER)[0]
try {
  await db.exec(before)
  ok('the schema as it was applies (without slice 1)')
} catch (e) {
  bad('apply the schema as it was', e)
}
// Rows as the live database holds them: written by each login (postgres, triggers as they are)
await db.exec(`
  insert into public.patients (id, owner_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', '${A}', 'Asha Rao'), ('bbbbbbbb-0000-0000-0000-000000000001', '${B}', 'Test Patient');
  insert into public.visits (id, owner_id, patient_id, visit_date, closed_at) values
    ('aaaaaaaa-0000-0000-0000-000000000002', '${A}', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-10-20', '2026-10-20T10:00:00Z'),
    ('bbbbbbbb-0000-0000-0000-000000000002', '${B}', 'bbbbbbbb-0000-0000-0000-000000000001', '2026-10-21', null);
  insert into public.visit_charges (owner_id, visit_id, patient_id, description, amount, kind) values ('${A}', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Root canal', 3500, 'item');
  insert into public.payments (owner_id, visit_id, patient_id, amount, method) values ('${A}', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 3500, 'cash');
  update public.visits set resend_needed = false where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  -- An appointment at a time the 30-minute grid no longer offers (made before it): the time check would refuse it now
  alter table public.appointments disable trigger user;
  insert into public.appointments (id, owner_id, patient_id, starts_at, duration_min, status) values ('aaaaaaaa-0000-0000-0000-000000000003', '${A}', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-10-27T04:10:00Z', 40, 'booked');
  alter table public.appointments enable trigger user;
  insert into public.booking_requests (owner_id, name, phone) values ('${A}', 'Ravi Kumar', '9876543210');
  insert into public.price_list (owner_id, line_no, slug, treatment, detail, cost) values ('${A}', 1, 'x-ray', 'X-Ray', 'Standard', '350/-');
`)
const stamp = async () => rowsOf(db, `
  select 'patients' t, id::text, updated_at::text u from public.patients
  union all select 'visits', id::text, updated_at::text from public.visits
  union all select 'visit_charges', id::text, updated_at::text from public.visit_charges
  union all select 'payments', id::text, updated_at::text from public.payments
  union all select 'appointments', id::text, updated_at::text from public.appointments
  order by 1, 2`)
const stampsBefore = await stamp()
try {
  await db.exec(read('multi-clinic-1-2026-10.sql'))
  await db.exec(read('multi-clinic-1-2026-10.sql'))
  ok('the change file applies twice on the schema as it was, with data in it')
} catch (e) {
  bad('apply the change file on the schema as it was', e)
}

const clinicOf = Object.fromEntries((await rowsOf(db, `select user_id::text, clinic_id::text from public.clinic_members`)).map((r) => [r.user_id, r.clinic_id]))
check('each login owns its own clinic', clinicOf[A] && clinicOf[B] && clinicOf[A] !== clinicOf[B], JSON.stringify(clinicOf))
const main = (await rowsOf(db, `select slug, name from public.clinics where id = '${clinicOf[A]}'`))[0]
check("Dr. Rahil's is Smile Dental Clinic (the clinic in app_config)", main?.slug === 'smile-dental-katapadi' && main?.name === 'Smile Dental Clinic', JSON.stringify(main))
check('running it again makes no second clinic', (await rowsOf(db, `select count(*)::int n from public.clinics`))[0].n === 2)

let unfilled = 0
for (const t of TABLES) {
  const wrong = await rowsOf(db, `select count(*)::int n from public.${t} x where x.clinic_id is distinct from (select m.clinic_id from public.clinic_members m where m.user_id = x.owner_id)`)
  unfilled += wrong[0].n
}
check("every existing row has its owner's clinic", unfilled === 0, `${unfilled} rows without it`)
check('the sent visit is not marked "bill changed"', (await rowsOf(db, `select resend_needed from public.visits where id = 'aaaaaaaa-0000-0000-0000-000000000002'`))[0].resend_needed === false)
check('no updated_at moved', JSON.stringify(await stamp()) === JSON.stringify(stampsBefore))
check('the appointment at an old time is still there, unchanged', (await rowsOf(db, `select starts_at = '2026-10-27T04:10:00Z' and duration_min = 40 and status = 'booked' same from public.appointments where id = 'aaaaaaaa-0000-0000-0000-000000000003'`))[0]?.same === true)
check("the tables' own triggers are on again", (await rowsOf(db, `select count(*)::int n from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and not t.tgisinternal and t.tgenabled = 'D'`))[0].n === 0)

// New rows: their owner's clinic, whoever inserts them
await as(db, A)
await db.exec(`insert into public.patients (name) values ('New Patient')`)
check("a patient Dr. Rahil adds is in his clinic", (await rowsOf(db, `select clinic_id::text c from public.patients where name = 'New Patient'`))[0]?.c === clinicOf[A])
await db.exec(`insert into public.visits (patient_id, visit_date) select id, '2026-10-30' from public.patients where name = 'New Patient'`)
check('so is his visit', (await rowsOf(db, `select v.clinic_id::text c from public.visits v join public.patients p on p.id = v.patient_id where p.name = 'New Patient'`))[0]?.c === clinicOf[A])
await db.exec(`reset role`)
await db.exec(`insert into public.booking_requests (owner_id, name, phone) values ('${A}', 'From The Website', '9123456780')`)
check("a row written for him by someone else (the website's booking, the scheduler) is in his clinic", (await rowsOf(db, `select clinic_id::text c from public.booking_requests where name = 'From The Website'`))[0]?.c === clinicOf[A])
check('a row that names its clinic keeps it', await (async () => {
  await db.exec(`insert into public.stock_items (owner_id, clinic_id, name) values ('${A}', '${clinicOf[B]}', 'Named clinic')`)
  return (await rowsOf(db, `select clinic_id::text c from public.stock_items where name = 'Named clinic'`))[0]?.c === clinicOf[B]
})())
check('a clinic with records cannot be deleted by mistake', (await err(db, `delete from public.clinics where id = '${clinicOf[A]}'`)) !== null &&
  (await rowsOf(db, `select count(*)::int n from public.patients where clinic_id = '${clinicOf[A]}'`))[0].n === 2)

// The helpers, and who reads the clinics
await as(db, A)
check("my_clinic_id() is Dr. Rahil's clinic for him", (await rowsOf(db, `select public.my_clinic_id()::text c`))[0].c === clinicOf[A])
check("he is a member of his clinic and not of the other", (await rowsOf(db, `select public.is_clinic_member('${clinicOf[A]}') a, public.is_clinic_member('${clinicOf[B]}') b`)).every((r) => r.a === true && r.b === false))
check('he reads his own clinic only', JSON.stringify(await rowsOf(db, `select id::text from public.clinics`)) === JSON.stringify([{ id: clinicOf[A] }]))
check("and only his clinic's members", (await rowsOf(db, `select user_id::text u from public.clinic_members`)).map((r) => r.u).join() === A)
check('he cannot make a clinic or join one', (await err(db, `insert into public.clinics (slug, name) values ('my-own', 'Mine')`)) !== null && (await err(db, `insert into public.clinic_members (clinic_id, user_id) values ('${clinicOf[B]}', '${A}')`)) !== null)
await as(db, B)
check('the other login reads only its own clinic', JSON.stringify(await rowsOf(db, `select id::text from public.clinics`)) === JSON.stringify([{ id: clinicOf[B] }]))
check('who sees which rows has not changed yet (each login its own)', (await rowsOf(db, `select count(*)::int n from public.patients`))[0].n === 1)
await as(db, '')
check('the website (anon) reads no clinic and no member', (await err(db, `select * from public.clinics`)) !== null && (await err(db, `select * from public.clinic_members`)) !== null)
check('nor runs the helpers', (await err(db, `select public.my_clinic_id()`)) !== null)

// 3. The change file's guard: if anything but the clinic would change, the whole change is undone
{
  const db = await start()
  await db.exec(before)
  await db.exec(`
    insert into public.patients (owner_id, name) values ('${A}', 'Asha Rao');
    insert into public.stock_items (owner_id, name) values ('${A}', 'Gloves');
    -- Something the change does not know about: a rule (not a trigger, so still on) that renames the gloves
    -- whenever a patient is updated, as filling a patient's clinic does
    create rule rename_gloves as on update to public.patients do also update public.stock_items set name = 'Renamed';
  `)
  let stopped = null
  try {
    await db.exec(read('multi-clinic-1-2026-10.sql'))
  } catch (e) {
    stopped = e.message
    await db.exec('rollback')
  }
  check('if anything else would change, the change stops and says where', stopped?.startsWith('Stopped, nothing changed') && stopped.includes('stock_items'), stopped ?? 'it went through')
  check('and nothing of it is kept', (await rowsOf(db, `select to_regclass('public.clinics') is null gone`))[0].gone &&
    (await rowsOf(db, `select count(*)::int n from information_schema.columns where table_schema = 'public' and column_name = 'clinic_id'`))[0].n === 0 &&
    (await rowsOf(db, `select name from public.stock_items`))[0].name === 'Gloves')
}

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
