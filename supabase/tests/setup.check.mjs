// Checks multi-clinic slice 5's database part (supabase/multi-clinic-5-2026-10.sql) in a throwaway Postgres
// (PGlite): setting a clinic up in one call (it waits for its members' logins, and running it again changes
// nothing twice), and the demo clinic's invented records (from today, started over each time, a demo clinic's
// only); neither for anyone signed in or the website.
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder and run
// it from there (copy this file next to node_modules): node setup.check.mjs <path to this repo>
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync } from 'node:fs'

const repo = process.argv[2]
const read = (f) => readFileSync(`${repo}/supabase/${f}`, 'utf8')

let failures = 0
let passes = 0
const ok = (name) => { passes++; console.log('PASS', name) }
const bad = (name, e) => { failures++; console.log('FAIL', name, e?.message ?? e) }
const check = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail || 'condition false'))

const A = '11111111-1111-1111-1111-111111111111' // Dr. Rahil (Smile Dental Clinic)
const DEMO = '55555555-5555-5555-5555-555555555555' // the demo clinic's login, made after the schema (as live)
const NOW = '2027-01-04T06:30:00Z' // Monday noon in India

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
  insert into auth.users values ('${A}', 'smiledental8925@gmail.com');
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`)
try {
  await db.exec(read('schema.sql'))
  await db.exec(read('schema.sql'))
  ok('schema.sql applies twice')
} catch (e) {
  bad('apply schema.sql twice', e)
}
await db.exec(`create or replace function public.clinic_now() returns timestamptz language sql stable as $$ select '${NOW}'::timestamptz $$;`)

const one = async (sql) => (await db.query(sql)).rows[0]
const err = async (sql) => { try { await db.query(sql); return null } catch (e) { return e.message } }
const as = async (who) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false); set role ${who ? 'authenticated' : 'anon'};`)
const n = async (sql) => (await one(`select count(*)::int n from (${sql}) x`)).n

const SETUP = JSON.stringify({
  slug: 'demo-bright-smile', name: 'Bright Smile Dental', place: 'Manipal', placeKn: 'ಮಣಿಪಾಲ', phone: '+91 9000000001',
  address: '2nd Floor, Lake View Complex, Manipal - 576104', shortAddress: 'Lake View Complex, Manipal',
  mapsLink: 'https://maps.example/bright', reviewLink: 'https://reviews.example/bright', upi: { id: 'brightsmile@upi', payee: 'Bright Smile Dental' },
  logo: '/images/logo.jpg', tally: { company: 'BRIGHT SMILE', cashLedger: 'Cash', bankLedger: 'Bank', patientGroup: 'Sundry Debtors' },
  chairs: ['Chair 1', 'Chair 2'],
  dentists: [
    { name: 'Dr. Kavya Shenoy', email: 'demo@example.com', shortName: 'Dr. Kavya', shortNameKn: 'ಡಾ. ಕಾವ್ಯಾ', qualifications: 'BDS, MDS', registration: '12345-A', signature: '/images/signature.png' },
    { name: 'Dr. Visiting Orthodontist', shortName: 'Dr. Ortho' },
  ],
  members: [{ email: 'demo@example.com', role: 'owner' }],
}).replace(/'/g, "''")

check("setting a clinic up waits for its members' logins, and says whose", (await err(`select public.setup_clinic('${SETUP}'::jsonb)`))?.includes('Make the login for demo@example.com first'))
await db.exec(`insert into auth.users values ('${DEMO}', 'demo@example.com')`)
const clinic = (await one(`select public.setup_clinic('${SETUP}'::jsonb)::text c`)).c
await db.exec(`select public.setup_clinic('${SETUP}'::jsonb)`)
check('set up (twice): the clinic, its two chairs, two dentists and its owner, once each',
  (await n(`select 1 from public.clinics where slug = 'demo-bright-smile'`)) === 1 && (await n(`select 1 from public.chairs where clinic_id = '${clinic}'`)) === 2
    && (await n(`select 1 from public.dentists where clinic_id = '${clinic}'`)) === 2 && (await n(`select 1 from public.clinic_members where clinic_id = '${clinic}'`)) === 1)
check('its dentist with a login is linked to it', (await one(`select user_id::text u from public.dentists where name = 'Dr. Kavya Shenoy'`)).u === DEMO)

// The demo records (Smile Dental Clinic has a patient of its own, with a visit, a payment and an appointment)
await as(A)
await db.exec(`
  insert into public.patients (name, phone) values ('Asha Kotian', '9000000099');
  insert into public.visits (patient_id, visit_date) select id, '2027-01-03' from public.patients where phone = '9000000099';
  insert into public.payments (patient_id, visit_id, amount, method) select patient_id, id, 500, 'cash' from public.visits;
  insert into public.appointments (patient_id, starts_at, duration_min, status)
    select id, '2027-01-05T05:30:00Z', 30, 'booked' from public.patients where phone = '9000000099';
`)
await db.exec('reset role')
const smile = `(select id from public.clinics where slug = 'smile-dental-katapadi')`
const smileRows = async () => n(`select 1 from public.patients where clinic_id = ${smile} union all select 1 from public.visits where clinic_id = ${smile}
  union all select 1 from public.payments where clinic_id = ${smile} union all select 1 from public.appointments where clinic_id = ${smile}`)
const seeded = (await one(`select public.seed_demo_clinic('demo-bright-smile') s`)).s
await db.exec(`select public.seed_demo_clinic('demo-bright-smile')`)
check('the demo clinic has ten invented patients (started over, not twenty)', seeded.patients === 10 && (await n(`select 1 from public.patients where clinic_id = '${clinic}'`)) === 10)
check("today: the times already over were seen and billed, the rest booked", (await n(`select 1 from public.visits where clinic_id = '${clinic}' and visit_date = '2027-01-04'`)) === 2
  && (await n(`select 1 from public.appointments where clinic_id = '${clinic}' and status = 'booked' and starts_at::date = '2027-01-04'`)) === 4)
check('…tomorrow has four to remind, a request waits, someone owes, and stock runs low',
  (await n(`select 1 from public.appointments where clinic_id = '${clinic}' and starts_at::date = '2027-01-05'`)) === 4
    && (await n(`select 1 from public.booking_requests where clinic_id = '${clinic}' and status = 'new'`)) === 1
    && (await n(`select 1 from public.visits v where v.clinic_id = '${clinic}' and not exists (select 1 from public.payments p where p.visit_id = v.id)`)) === 1
    && (await n(`select 1 from public.stock_levels l join public.stock_items i on i.id = l.item_id where i.clinic_id = '${clinic}' and l.on_hand <= l.low_level`)) === 1)
check('no demo bill reads "changed after sending"', (await n(`select 1 from public.visits where clinic_id = '${clinic}' and resend_needed`)) === 0)
check("only a demo clinic is filled: Smile Dental Clinic's is refused", (await err(`select public.seed_demo_clinic('smile-dental-katapadi')`))?.includes('Only a demo clinic'))
check("starting the demo over leaves Smile Dental Clinic's records alone", (await smileRows()) === 4)

// Its login sees its clinic only, and Smile Dental Clinic's records are untouched
await as(DEMO)
check("the demo login sees its clinic's patients only", (await n('select 1 from public.patients')) === 10 && (await one('select public.my_clinic_id()::text c')).c === clinic)
check('nobody signed in sets a clinic up or fills one', (await err(`select public.setup_clinic('${SETUP}'::jsonb)`)) !== null && (await err(`select public.seed_demo_clinic('demo-bright-smile')`)) !== null)
await as('')
check('…nor the website', (await err(`select public.seed_demo_clinic('demo-bright-smile')`)) !== null)
await db.exec('reset role')

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
