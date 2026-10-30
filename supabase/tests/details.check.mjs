// Checks multi-clinic slice 3a (supabase/multi-clinic-3-2026-10.sql) in a throwaway Postgres (PGlite):
// - the schema with it applies twice, and Smile Dental Clinic has its details and Dr. Rahil his (a new
//   database's other clinics have none: they are set up with their own);
// - on the database as it was, the change file runs twice: Smile Dental Clinic's details, and the test
//   account's clinic ("New clinic") a copy of them, its dentist under Dr. Rahil's name; nothing else moves;
// - members read their clinic's details and change none; the website (anon) reads none.
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder and run
// it from there (copy this file next to node_modules): node details.check.mjs <path to this repo>
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync } from 'node:fs'

const repo = process.argv[2]
const read = (f) => readFileSync(`${repo}/supabase/${f}`, 'utf8')
const MARKER = '\n-- Multi-clinic, slice 3a (30 Oct 2026'

let failures = 0
let passes = 0
const ok = (name) => { passes++; console.log('PASS', name) }
const bad = (name, e) => { failures++; console.log('FAIL', name, e?.message ?? e) }
const check = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail || 'condition false'))

const A = '11111111-1111-1111-1111-111111111111' // Dr. Rahil (Smile Dental Clinic)
const B = '22222222-2222-2222-2222-222222222222' // the owner's test account
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
    insert into auth.users values ('${A}', 'smiledental8925@gmail.com'), ('${B}', 'test@example.com');
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `)
  return db
}
const one = async (db, sql) => (await db.query(sql)).rows[0]
const as = async (db, who) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false); set role ${who ? 'authenticated' : 'anon'};`)
const err = async (db, sql) => { try { await db.query(sql); return null } catch (e) { return e.message } }
const CLINIC = `select c.name, c.place, c.place_kn, c.phone, c.address, c.short_address, c.review_link, c.upi_id,
  c.tally->>'company' company, c.chair_monitor->>'address' monitor, d.name dentist, d.short_name, d.short_name_kn, d.registration, d.signature
  from public.clinics c join public.clinic_members m on m.clinic_id = c.id join public.dentists d on d.clinic_id = c.id`
const SMILE = {
  name: 'Smile Dental Clinic', place: 'Katapadi', place_kn: 'ಕಟಪಾಡಿ', phone: '+91 6361816711',
  address: '1st Floor, YM Zohara Building, Shirva Rd, near Bank of Baroda (formerly Vijaya Bank), Yenna Gudde, Katapadi - 574105',
  short_address: '1st Floor, YM Zohara Building, Shirva Road, Katapadi', review_link: 'https://g.page/r/CUdtAiciUfvKEBM/review',
  upi_id: 'rahil.yusuf.k-1@okhdfcbank', company: 'SMILE DENTAL0', monitor: 'http://192.168.1.1', dentist: 'Dr. Rahil Yusuf',
  short_name: 'Dr. Rahil', short_name_kn: 'ಡಾ. ರಾಹಿಲ್', registration: '51950-A', signature: '/images/signature.png',
}

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
  check("Smile Dental Clinic has its details, and Dr. Rahil his", JSON.stringify(await one(db, `${CLINIC} where m.user_id = '${A}'`)) === JSON.stringify(SMILE),
    JSON.stringify(await one(db, `${CLINIC} where m.user_id = '${A}'`)))
  const other = await one(db, `${CLINIC} where m.user_id = '${B}'`)
  check("a new database's other clinic has none (it is set up with its own)", other.name === 'New clinic' && other.phone === null && other.registration === null, JSON.stringify(other))
}

// 2. The database as it was (the live one), then the change file twice
const db = await start()
await db.exec(read('schema.sql').split(MARKER)[0])
const slugs = (await db.query('select slug from public.clinics order by slug')).rows
try {
  await db.exec(read('multi-clinic-3-2026-10.sql'))
  await db.exec(read('multi-clinic-3-2026-10.sql'))
  ok('the change file applies twice on the database as it was')
} catch (e) {
  bad('apply the change file on the database as it was', e)
}
check("Smile Dental Clinic has its details, and Dr. Rahil his", JSON.stringify(await one(db, `${CLINIC} where m.user_id = '${A}'`)) === JSON.stringify(SMILE))
check("the test account's clinic is a copy of them (its own slug kept), so the tests read Dr. Rahil's messages",
  JSON.stringify(await one(db, `${CLINIC} where m.user_id = '${B}'`)) === JSON.stringify(SMILE)
    && JSON.stringify((await db.query('select slug from public.clinics order by slug')).rows) === JSON.stringify(slugs),
  JSON.stringify(await one(db, `${CLINIC} where m.user_id = '${B}'`)))

// The patient's link page (slice 3b): a link says which clinic and dentist it is from
try {
  await db.exec(read('multi-clinic-3b-2026-10.sql'))
  await db.exec(read('multi-clinic-3b-2026-10.sql'))
  ok("3b's change file applies twice")
} catch (e) {
  bad("apply 3b's change file", e)
}
const TOKEN = 'a'.repeat(40)
await db.exec(`insert into public.patients (id, owner_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', '${A}', 'Asha Rao');
  insert into public.visits (id, owner_id, patient_id, visit_date) values ('aaaaaaaa-0000-0000-0000-000000000002', '${A}', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-10-30');
  insert into public.share_links (owner_id, visit_id, token) values ('${A}', 'aaaaaaaa-0000-0000-0000-000000000002', '${TOKEN}');`)
await as(db, '')
const shared = (await one(db, `select public.shared_photos('${TOKEN}') s`)).s
check("a link names its clinic and the dentist the prescription is from (for anyone who has it)",
  shared.first_name === 'Asha' && shared.clinic?.name === SMILE.name && shared.clinic?.phone === SMILE.phone && shared.clinic?.address === SMILE.address
    && shared.clinic?.dentist?.name === SMILE.dentist && shared.clinic?.dentist?.registration === SMILE.registration && shared.clinic?.dentist?.signature === SMILE.signature,
  JSON.stringify(shared))
await db.exec(`reset role; update public.share_links set expires_at = now() - interval '1 day' where token = '${TOKEN}'`)
await as(db, '')
const expired = (await one(db, `select public.shared_photos('${TOKEN}') s`)).s
check('an expired link says only which clinic to call', expired.expired === true
  && Object.keys(expired.clinic ?? {}).sort().join() === 'name,phone,place'
  && expired.clinic.name === SMILE.name && expired.clinic.place === SMILE.place && expired.clinic.phone === SMILE.phone, JSON.stringify(expired))
await db.exec('reset role')

// Who reads and changes them
await as(db, A)
check('a member reads their clinic\'s details', (await one(db, 'select phone from public.clinics')).phone === SMILE.phone)
check("…and changes none (the operator sets them up)", (await err(db, `update public.clinics set phone = '+91 0000000000'`)) !== null
  && (await err(db, `update public.dentists set registration = 'X'`)) !== null)
await as(db, '')
check('the website (anon) reads none', (await err(db, 'select phone from public.clinics')) !== null)
await db.exec('reset role')

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
