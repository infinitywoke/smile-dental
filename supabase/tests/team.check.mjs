// Checks multi-clinic slice 7's database part (supabase/multi-clinic-7-2026-10.sql) in a throwaway Postgres
// (PGlite): a clinic with several chairs and dentists. Free times count them, visiting specialists open none, a
// dentist runs two chairs only on purpose and never three, and the owner alone keeps the team. A clinic with one
// chair and one dentist behaves as before (booking.check.mjs).
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder and run
// it from there (copy this file next to node_modules): node team.check.mjs <path to this repo>
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync } from 'node:fs'

const repo = process.argv[2]
const read = (f) => readFileSync(`${repo}/supabase/${f}`, 'utf8')

let failures = 0
let passes = 0
const check = (name, cond, detail = '') => {
  if (cond) { passes++; console.log('PASS', name) } else { failures++; console.log('FAIL', name, detail || 'condition false') }
}

const OWNER = '11111111-1111-1111-1111-111111111111'
const HELPER = '22222222-2222-2222-2222-222222222222'
const NOW = '2027-01-04T02:30:00Z' // Monday, 8 AM in India

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
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`)
await db.exec(read('schema.sql'))
await db.exec(read('schema.sql'))
check('schema.sql applies twice', true)
await db.exec(`insert into auth.users values ('${OWNER}', 'owner@brightside.example'), ('${HELPER}', 'helper@brightside.example')`)
await db.exec(`create or replace function public.clinic_now() returns timestamptz language sql stable as $$ select '${NOW}'::timestamptz $$;`)

const one = async (sql) => (await db.query(sql)).rows[0]
const err = async (sql) => { try { await db.query(sql); return null } catch (e) { return e.message } }
const n = async (sql) => (await one(`select count(*)::int n from (${sql}) x`)).n
const as = async (who) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false); set role ${who ? 'authenticated' : 'anon'};`)

const clinic = (await one(`select public.setup_clinic('${JSON.stringify({
  slug: 'demo-team', name: 'Team Dental', place: 'Manipal', phone: '+91 9000000001', address: 'Manipal',
  chairs: ['Chair 1', 'Chair 2'],
  dentists: [{ name: 'Dr. One' }, { name: 'Dr. Two' }, { name: 'Dr. Visiting', visiting: true }],
  members: [{ email: 'owner@brightside.example', role: 'owner' }, { email: 'helper@brightside.example', role: 'assistant' }],
})}'::jsonb)::text c`)).c
const dentist = async (name) => (await one(`select id::text i from public.dentists where clinic_id = '${clinic}' and name = '${name}'`)).i
const [one1, two2, visiting] = [await dentist('Dr. One'), await dentist('Dr. Two'), await dentist('Dr. Visiting')]
const at = (hhmm) => `2027-01-05 ${hhmm}+05:30` // Tuesday
const free = async (hhmm) => (await n(`select 1 from public.get_open_slots('demo-team', '2027-01-05', 1) where slot_start = '${at(hhmm)}'`)) === 1

let phone = 0
const patient = async () => {
  phone++
  return (await one(`insert into public.patients (owner_id, clinic_id, name, phone) values ('${OWNER}', '${clinic}', 'P${phone}', '90000001${String(phone).padStart(2, '0')}') returning id::text i`)).i
}
const book = async (hhmm, { who = null, two = false } = {}) => {
  const p = await patient()
  return err(`insert into public.appointments (owner_id, clinic_id, patient_id, dentist_id, starts_at, duration_min, status, two_chairs)
              values ('${OWNER}', '${clinic}', '${p}', ${who ? `'${who}'` : 'null'}, '${at(hhmm)}', 30, 'booked', ${two})`)
}

check('a time with nothing booked is free', await free('10:00'))
await book('10:00', { who: one1 })
check('one chair and one dentist still free: the time stays open', await free('10:00'))
await book('10:00', { who: two2 })
check('both chairs in use: the time closes', !(await free('10:00')))
check('…and a third booking is refused: no chair', (await book('10:00', { who: visiting }))?.includes('appointments_chair_free'))

await book('11:00', { who: visiting })
check("a visiting specialist's patient takes a chair; the time stays open", await free('11:00'))
await book('11:00', { who: one1 })
check("…and with both chairs in use it closes", !(await free('11:00')))

await book('15:00', { who: one1 })
await book('15:00', { who: visiting })
await db.exec(`insert into public.time_off (owner_id, clinic_id, dentist_id, starts_at, ends_at) values ('${OWNER}', '${clinic}', '${two2}', '${at('12:00')}', '${at('13:00')}')`)
await book('12:00', { who: one1 })
check("a dentist's own time off, the other one busy: no dentist, so the time closes", !(await free('12:00')))
check("…and a booking for the dentist who is off is refused", (await book('12:00', { who: two2 }))?.includes('blocked off'))

check('a dentist already busy is refused', (await book('16:00', { who: one1 })) === null && (await book('16:00', { who: one1 }))?.includes('appointments_dentist_free'))
check('…but runs two chairs when it is marked', (await book('16:00', { who: one1, two: true })) === null)
await db.exec(`insert into public.chairs (clinic_id, name) values ('${clinic}', 'Chair 3')`)
check('never three, even with a chair free', (await book('16:00', { who: one1, two: true }))?.includes('not three'))
check('a marked booking still needs a chair of its own', (await n(`select 1 from public.appointments where starts_at = '${at('16:00')}' group by chair_id having count(*) > 1`)) === 0)
const p = await patient()
await err(`insert into public.appointments (owner_id, clinic_id, patient_id, dentist_id, starts_at, duration_min, status) values ('${OWNER}', '${clinic}', '${p}', '${two2}', '${at('17:00')}', 30, 'booked')`)
check('a patient stays one at a time, marked or not', (await err(`insert into public.appointments (owner_id, clinic_id, patient_id, dentist_id, starts_at, duration_min, status, two_chairs) values ('${OWNER}', '${clinic}', '${p}', '${one1}', '${at('17:00')}', 30, 'booked', true)`))?.includes('appointments_patient_free'))

// A booking naming no dentist
check('no dentist named: it goes to one who is free', (await book('17:30', { who: one1 })) === null && (await book('17:30')) === null
  && (await n(`select 1 from public.appointments where starts_at = '${at('17:30')}' and dentist_id = '${two2}'`)) === 1)
await db.exec(`update public.chairs set active = false where clinic_id = '${clinic}' and name = 'Chair 3'`)

// Who keeps the team
await as(HELPER)
check('an assistant sees the team and cannot change it', (await n('select 1 from public.chairs')) === 3
  && (await err(`insert into public.chairs (clinic_id, name) values ('${clinic}', 'Chair 9')`)) !== null)
await db.exec(`update public.dentists set name = 'Changed' where id = '${two2}'`)
await as(OWNER)
check("…so their update changes nothing", (await n(`select 1 from public.dentists where id = '${two2}' and name = 'Dr. Two'`)) === 1)
check('the owner adds a chair and a dentist', (await err(`insert into public.chairs (clinic_id, name) values ('${clinic}', 'Chair 4')`)) === null
  && (await err(`insert into public.dentists (clinic_id, name, visiting) values ('${clinic}', 'Dr. New', true)`)) === null)
check("…but not to another clinic, nor linking a login", (await err(`insert into public.chairs (clinic_id, name) values ('00000000-0000-4000-8000-000000000099', 'X')`)) !== null
  && (await err(`update public.dentists set user_id = '${HELPER}' where id = '${two2}'`)) !== null)
check('a dentist with bookings to come stays', (await err(`update public.dentists set active = false where id = '${one1}'`))?.includes('still has bookings'))
check('a chair with bookings to come stays', (await err(`update public.chairs set active = false where clinic_id = '${clinic}' and name = 'Chair 1'`))?.includes('still has bookings'))
check('a dentist with none can go', (await err(`update public.dentists set active = false where clinic_id = '${clinic}' and name = 'Dr. New'`)) === null)
await as('')
check('the website changes nothing', (await err(`insert into public.chairs (clinic_id, name) values ('${clinic}', 'X')`)) !== null)
await db.exec('reset role')
check('whether patients pick a dentist starts as no', (await one(`select patients_pick_dentist p from public.clinics where id = '${clinic}'`)).p === false)

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
