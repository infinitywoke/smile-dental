// Checks multi-clinic slice 2a (supabase/multi-clinic-2-2026-10.sql) in a throwaway Postgres (PGlite):
// - the schema with it applies twice: clinic required, records outlive their maker, the clinic filled in first;
// - on the database as it was, with rows and files in it, the change file runs twice, and every login sees
//   exactly what it saw (the file's own guard checks the same and undoes the change otherwise);
// - a second person in a clinic (an assistant) sees and adds to its rows and files, under the clinic's rules:
//   a new row is its maker's, the clinic's materials are used, no overlapping or blocked-off bookings, a
//   website request confirmed, the price list loaded for the website; another clinic sees none of it;
// - a login with records can't be deleted, and a login with no clinic can't add anything;
// - the guard: if someone would see more or less than before, the change stops and none of it is kept.
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder and run
// it from there (copy this file next to node_modules): node access.check.mjs <path to this repo>
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync } from 'node:fs'

const repo = process.argv[2]
const read = (f) => readFileSync(`${repo}/supabase/${f}`, 'utf8')
const MARKER = '\n-- Multi-clinic, slice 2a (30 Oct 2026'

let failures = 0
let passes = 0
const ok = (name) => { passes++; console.log('PASS', name) }
const bad = (name, e) => { failures++; console.log('FAIL', name, e?.message ?? e) }
const check = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail || 'condition false'))

const A = '11111111-1111-1111-1111-111111111111' // Dr. Rahil (Smile Dental Clinic)
const B = '22222222-2222-2222-2222-222222222222' // another clinic's dentist
const C = '33333333-3333-3333-3333-333333333333' // an assistant, joining Dr. Rahil's clinic
const D = '44444444-4444-4444-4444-444444444444' // a login made later, in no clinic
const PA = 'aaaaaaaa-0000-0000-0000-000000000001'
const VA = 'aaaaaaaa-0000-0000-0000-000000000002'
const RA = 'aaaaaaaa-0000-0000-0000-000000000003' // a website request to Dr. Rahil's clinic
const PA2 = 'aaaaaaaa-0000-0000-0000-000000000004'
const PA3 = 'aaaaaaaa-0000-0000-0000-000000000005'
const PB = 'bbbbbbbb-0000-0000-0000-000000000001'
const VB = 'bbbbbbbb-0000-0000-0000-000000000002'

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
    grant select, insert, delete on storage.objects to authenticated;
    insert into auth.users values ('${A}', 'smiledental8925@gmail.com'), ('${B}', 'other@example.com');
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `)
  return db
}
const rowsOf = async (db, sql, params) => (await db.query(sql, params)).rows
const one = async (db, sql) => (await db.query(sql)).rows[0]
const as = async (db, who) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false); set role ${who ? 'authenticated' : 'anon'};`)
const err = async (db, sql) => { try { await db.query(sql); return null } catch (e) { return e.message } }
const count = async (db, sql) => (await one(db, `select count(*)::int n from (${sql}) x`)).n

const TABLES = ['patients', 'visits', 'visit_photos', 'visit_charges', 'payments', 'share_links', 'appointments',
  'time_off', 'booking_requests', 'visit_recordings', 'tally_settings', 'fixed_costs', 'costs', 'stock_items',
  'stock_moves', 'treatment_materials', 'price_list']

// Rows and files for two clinics, as the live database holds them (written as postgres)
const fill = (db) => db.exec(`
  insert into public.patients (id, owner_id, name) values ('${PA}', '${A}', 'Asha Rao'), ('${PB}', '${B}', 'Test Patient');
  insert into public.visits (id, owner_id, patient_id, visit_date) values ('${VA}', '${A}', '${PA}', '2026-10-20'), ('${VB}', '${B}', '${PB}', '2026-10-21');
  insert into public.visit_photos (owner_id, visit_id, storage_path) values ('${A}', '${VA}', '${A}/${VA}/one.jpg'), ('${B}', '${VB}', '${B}/${VB}/two.jpg');
  insert into public.visit_recordings (owner_id, visit_id, storage_path) values ('${A}', '${VA}', '${A}/${VA}/note.webm');
  insert into public.appointments (owner_id, patient_id, starts_at, duration_min, status) values ('${A}', '${PA}', '2027-01-04T04:00:00Z', 30, 'booked');
  insert into public.time_off (owner_id, starts_at, ends_at) values ('${A}', '2027-01-05T03:00:00Z', '2027-01-05T12:00:00Z');
  insert into public.booking_requests (id, owner_id, name, phone) values ('${RA}', '${A}', 'Ravi Kumar', '9876543210');
  insert into public.stock_items (owner_id, name) values ('${A}', 'GIC capsule'), ('${B}', 'Gloves');
  insert into public.treatment_materials (owner_id, treatment_slug, charge_description, item_id, qty)
    select '${A}', 'fillings', 'Fillings – 3M Ketac Molar GIC', id, 1 from public.stock_items where name = 'GIC capsule';
  insert into public.price_list (owner_id, line_no, slug, treatment, detail, cost) values ('${A}', 1, 'x-ray', 'X-Ray', 'Standard', '350/-');
  insert into storage.objects (bucket_id, name) values
    ('visit-photos', '${A}/${VA}/one.jpg'), ('visit-photos', '${B}/${VB}/two.jpg'),
    ('visit-audio', '${A}/${VA}/note.webm'), ('cost-bills', '${A}/bill.jpg'), ('request-voice', '${RA}.webm');
`)

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
  const triggers = await rowsOf(db, `select c.relname t, g.tgname n from pg_trigger g join pg_class c on c.oid = g.tgrelid
    join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and g.tgname like '%fill_clinic'`)
  check('the clinic is filled in first on all 17 tables (no older trigger left)',
    triggers.length === 17 && triggers.every((r) => r.n === '0_fill_clinic'), JSON.stringify(triggers.filter((r) => r.n !== '0_fill_clinic')))
  const nullable = await rowsOf(db, `select table_name from information_schema.columns where table_schema = 'public' and column_name = 'clinic_id' and is_nullable = 'YES' and table_name <> 'clinic_members'`)
  check('every clinic table requires a clinic', nullable.length === 0, JSON.stringify(nullable))
  const cascading = await rowsOf(db, `select t.relname from pg_constraint k join pg_class t on t.oid = k.conrelid
    where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and k.confdeltype <> 'r' and t.relname = any($1)`, [TABLES])
  check("no clinic table's records go when the login that made them does", cascading.length === 0, JSON.stringify(cascading))
  const places = await rowsOf(db, `select c.slug,
      (select string_agg(h.name, ',') from public.chairs h where h.clinic_id = c.id) chairs,
      (select string_agg(d.name || ':' || coalesce(d.user_id::text, ''), ',') from public.dentists d where d.clinic_id = c.id) dentists
    from public.clinics c order by c.slug`)
  check('every clinic starts with Chair 1 and its owner as its dentist (Smile Dental Clinic: Dr. Rahil Yusuf)',
    places.length === 2 && places.every((p) => p.chairs === 'Chair 1')
      && places.find((p) => p.slug === 'smile-dental-katapadi')?.dentists === `Dr. Rahil Yusuf:${A}`, JSON.stringify(places))
}

// 2. The database as it was (the live one, slice 1 in), with rows and files, then the change file twice
const db = await start()
await db.exec(read('schema.sql').split(MARKER)[0])
await fill(db)
const seen = async (who) => {
  await as(db, who)
  const n = {}
  for (const t of TABLES) n[t] = await count(db, `select 1 from public.${t}`)
  for (const b of ['visit-photos', 'visit-audio', 'cost-bills', 'request-voice']) n[b] = await count(db, `select 1 from storage.objects where bucket_id = '${b}'`)
  await db.exec('reset role')
  return n
}
const before = { [A]: await seen(A), [B]: await seen(B) }
try {
  await db.exec(read('multi-clinic-2-2026-10.sql'))
  await db.exec(read('multi-clinic-2-2026-10.sql'))
  ok('the change file applies twice on the database as it was, with rows and files (its guard passed)')
} catch (e) {
  bad('apply the change file on the database as it was', e)
}
const after = { [A]: await seen(A), [B]: await seen(B) }
check('each login sees exactly what it saw, table by table and file by file', JSON.stringify(after) === JSON.stringify(before),
  JSON.stringify({ before, after }))
check('Dr. Rahil still sees his patient, photo, recording, bill and voice note',
  after[A].patients === 1 && after[A]['visit-photos'] === 1 && after[A]['visit-audio'] === 1 && after[A]['cost-bills'] === 1 && after[A]['request-voice'] === 1,
  JSON.stringify(after[A]))
check("Dr. Rahil's appointment is in Chair 1, with him (and otherwise unchanged: the guard checked)",
  JSON.stringify(await one(db, `select h.name chair, d.name dentist from public.appointments a join public.chairs h on h.id = a.chair_id
    join public.dentists d on d.id = a.dentist_id where a.owner_id = '${A}'`)) === JSON.stringify({ chair: 'Chair 1', dentist: 'Dr. Rahil Yusuf' }))
check('a login with records cannot be deleted', (await err(db, `delete from auth.users where id = '${A}'`)) !== null)
check('…and nothing went with the attempt', (await count(db, `select 1 from public.patients where owner_id = '${A}'`)) === 1)

// 3. A second person in the clinic: an assistant joins Dr. Rahil's
const clinicA = (await one(db, `select clinic_id::text c from public.clinic_members where user_id = '${A}'`)).c
await db.exec(`insert into auth.users values ('${C}', 'assistant@example.com');
  insert into public.clinic_members (clinic_id, user_id, role) values ('${clinicA}', '${C}', 'assistant');`)
await as(db, C)
check("the assistant sees the clinic's patient, visit and appointment", (await count(db, 'select 1 from public.patients')) === 1
  && (await count(db, 'select 1 from public.visits')) === 1 && (await count(db, 'select 1 from public.appointments')) === 1)
check("…and its photo, recording, bill and the request's voice note (in Dr. Rahil's folder)",
  (await count(db, `select 1 from storage.objects where bucket_id in ('visit-photos', 'visit-audio', 'cost-bills', 'request-voice')`)) === 4)
const visitC = await err(db, `insert into public.visits (patient_id, visit_date) values ('${PA}', '2026-10-30')`)
const made = await one(db, `select owner_id::text o, clinic_id::text c from public.visits where visit_date = '2026-10-30'`)
check("the assistant adds a visit for the clinic's patient: theirs, in the clinic", visitC === null && made?.o === C && made?.c === clinicA, visitC ?? JSON.stringify(made))
check("but can't write a row in Dr. Rahil's name", (await err(db, `insert into public.patients (owner_id, name) values ('${A}', 'Under His Name')`)) !== null)
const visitNew = (await one(db, `select id::text i from public.visits where visit_date = '2026-10-30'`)).i
await db.exec(`insert into public.visit_charges (visit_id, patient_id, description, amount, kind, treatment_slug)
  values ('${visitNew}', '${PA}', 'Fillings – 3M Ketac Molar GIC', 700, 'item', 'fillings')`)
check("a filling the assistant charges takes the clinic's materials off stock",
  (await count(db, `select 1 from public.stock_moves where kind = 'use'`)) === 1)
const overlap = await err(db, `insert into public.appointments (patient_id, starts_at, duration_min, status) values ('${PA}', '2027-01-04T04:15:00Z', 30, 'booked')`)
check("no booking over Dr. Rahil's booked time, whoever makes it", overlap !== null && /appointments_no_overlap|exclusion|conflicting/.test(overlap), overlap)
const blocked = await err(db, `insert into public.appointments (patient_id, starts_at, duration_min, status) values ('${PA}', '2027-01-05T05:00:00Z', 30, 'booked')`)
check("nor in the clinic's time off (the clinic is filled in before the check)", blocked?.includes('blocked off'), blocked)
const confirmed = await err(db, `select * from public.confirm_booking_request('${RA}', '2027-01-06T04:00:00Z')`)
check("the assistant confirms a website request to the clinic", confirmed === null
  && (await one(db, `select status from public.booking_requests where id = '${RA}'`)).status === 'booked', confirmed)
await db.exec(`select public.replace_price_list('[{"slug": "x-ray", "treatment": "X-Ray", "detail": "Standard", "cost": "400/-"}]'::jsonb)`)
await as(db, '')
check("a price list the assistant loads is the one the website shows",
  JSON.stringify(await rowsOf(db, 'select treatment, cost from public.public_price_list()')) === JSON.stringify([{ treatment: 'X-Ray', cost: '400/-' }]))
await as(db, C)
const upload = (path) => err(db, `insert into storage.objects (bucket_id, name) values ('visit-photos', '${path}')`)
check("the assistant uploads to the clinic's folder or their own", (await upload(`${clinicA}/${VA}/c.jpg`)) === null && (await upload(`${C}/${VA}/c3.jpg`)) === null)
check("…not into Dr. Rahil's folder or another clinic's", (await upload(`${A}/${VA}/c2.jpg`)) !== null && (await upload(`${B}/${VB}/c4.jpg`)) !== null)
check("a photo's row may point at a file in a member's folder", (await err(db, `insert into public.visit_photos (visit_id, storage_path) values ('${VA}', '${C}/${VA}/c3.jpg')`)) === null)
check("…but not at another visit's folder", (await err(db, `insert into public.visit_photos (visit_id, storage_path) values ('${VA}', '${C}/${VB}/x.jpg')`)) !== null)

// More chairs and dentists: the clinic adds Chair 2, a visiting orthodontist and a visiting surgeon (no logins)
await db.exec('reset role')
await db.exec(`insert into public.chairs (clinic_id, name) values ('${clinicA}', 'Chair 2');
  insert into public.dentists (clinic_id, name) values ('${clinicA}', 'Dr. Visiting Orthodontist'), ('${clinicA}', 'Dr. Visiting Surgeon');
  insert into public.patients (id, owner_id, name) values ('${PA2}', '${A}', 'Meera Shetty'), ('${PA3}', '${A}', 'Kiran Pai');`)
const idOf = async (table, name) => (await one(db, `select id::text i from public.${table} where name = '${name}' and clinic_id = '${clinicA}'`)).i
const [RAHIL, ORTHO, SURGEON] = [await idOf('dentists', 'Dr. Rahil Yusuf'), await idOf('dentists', 'Dr. Visiting Orthodontist'), await idOf('dentists', 'Dr. Visiting Surgeon')]
const [CHAIR1, CHAIR2] = [await idOf('chairs', 'Chair 1'), await idOf('chairs', 'Chair 2')]
await db.exec(`insert into public.time_off (owner_id, dentist_id, starts_at, ends_at) values ('${A}', '${RAHIL}', '2027-01-07T03:00:00Z', '2027-01-07T12:00:00Z')`)
await as(db, C)
const book = (patient, dentist, at, chair) => err(db, `insert into public.appointments (patient_id, dentist_id, starts_at, duration_min, status${chair ? ', chair_id' : ''})
  values ('${patient}', '${dentist}', '${at}', 30, 'booked'${chair ? `, '${chair}'` : ''})`)
const chairOf = async (patient, at) => (await one(db, `select h.name from public.appointments a join public.chairs h on h.id = a.chair_id
  where a.patient_id = '${patient}' and a.starts_at = '${at}' and a.status = 'booked'`))?.name
const T = '2027-01-04T04:00:00Z' // Dr. Rahil is booked then, in Chair 1
const U = '2027-01-04T05:00:00Z'
const placed = await book(PA2, ORTHO, T)
check("another dentist is booked at Dr. Rahil's time, into the free chair", placed === null && (await chairOf(PA2, T)) === 'Chair 2', placed)
const third = await book(PA3, SURGEON, T)
check('…but not a third at once: both chairs are taken', /appointments_chair_free/.test(third ?? ''), third)
await book(PA2, RAHIL, U)
const twice = await book(PA3, RAHIL, U)
check('a dentist is in one chair at a time (Chair 2 is free, Dr. Rahil is not)', /appointments_dentist_free/.test(twice ?? ''), twice)
const both = await book(PA2, SURGEON, U)
check('…and so is a patient', /appointments_patient_free/.test(both ?? ''), both)
check("Dr. Rahil's own time off leaves the others bookable", (await book(PA3, ORTHO, '2027-01-07T05:00:00Z')) === null)
check('…and blocks him alone', (await book(PA, RAHIL, '2027-01-07T06:00:00Z'))?.includes('blocked off'))
await book(PA3, SURGEON, '2027-01-08T04:00:00Z', CHAIR2)
const moved = await err(db, `update public.appointments set starts_at = '2027-01-08T04:00:00Z' where patient_id = '${PA2}' and starts_at = '${T}'`)
check('moved to a time when its chair is taken, an appointment changes to the free chair', moved === null && (await chairOf(PA2, '2027-01-08T04:00:00Z')) === 'Chair 1', moved)
check("members read the clinic's chairs and dentists, and can't add them (the operator does, for now)",
  (await count(db, 'select 1 from public.chairs')) === 2 && (await count(db, 'select 1 from public.dentists')) === 3
    && (await err(db, `insert into public.chairs (clinic_id, name) values ('${clinicA}', 'Chair 3')`)) !== null)
await as(db, B)
check("another clinic sees only its own chair, and can't book into this clinic's",
  (await count(db, 'select 1 from public.chairs')) === 1
    && (await err(db, `insert into public.appointments (patient_id, chair_id, starts_at, duration_min, status) values ('${PB}', '${CHAIR1}', '2027-01-09T04:00:00Z', 30, 'booked')`)) !== null)
await as(db, '')
check('the website (anon) reads no chairs or dentists', (await err(db, 'select * from public.chairs')) !== null && (await err(db, 'select * from public.dentists')) !== null)
await as(db, C)

// The other clinic sees none of it, and can't reach into it
await as(db, B)
check('the other clinic sees only its own patient and photo', (await count(db, 'select 1 from public.patients')) === 1
  && (await count(db, `select 1 from storage.objects where bucket_id = 'visit-photos'`)) === 1)
check("…can't add a visit for Dr. Rahil's patient", (await err(db, `insert into public.visits (patient_id, visit_date) values ('${PA}', '2026-10-31')`)) !== null)
check("…or read the clinic's folder", (await count(db, `select 1 from storage.objects where name like '${clinicA}/%'`)) === 0)
await db.exec('reset role')

// A login made later, in no clinic, can't add anything
await db.exec(`insert into auth.users values ('${D}', 'nobody@example.com')`)
await as(db, D)
check('a login in no clinic sees nothing and adds nothing', (await count(db, 'select 1 from public.patients')) === 0
  && (await err(db, `insert into public.patients (name) values ('Nobody Patient')`)) !== null)
await db.exec('reset role')

// 4. The guard: someone already in a clinic before the change would see more after it
{
  const db = await start()
  await db.exec(read('schema.sql').split(MARKER)[0])
  await fill(db)
  const clinic = (await one(db, `select clinic_id::text c from public.clinic_members where user_id = '${A}'`)).c
  await db.exec(`insert into auth.users values ('${C}', 'assistant@example.com');
    insert into public.clinic_members (clinic_id, user_id, role) values ('${clinic}', '${C}', 'assistant');`)
  let stopped = null
  try {
    await db.exec(read('multi-clinic-2-2026-10.sql'))
  } catch (e) {
    stopped = e.message
    await db.exec('rollback')
  }
  check('if someone would see more or less than before, the change stops and says so', stopped?.startsWith('Stopped, nothing changed'), stopped ?? 'it went through')
  check('…and none of it is kept', (await count(db, `select 1 from pg_policies where policyname = 'Owner full access' and tablename = 'patients'`)) === 1
    && (await count(db, `select 1 from pg_trigger where tgname = '0_fill_clinic'`)) === 0
    && (await count(db, `select 1 from information_schema.columns where table_name = 'patients' and column_name = 'clinic_id' and is_nullable = 'YES'`)) === 1)
}

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
