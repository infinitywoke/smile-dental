// Checks supabase/records-2026-10.sql in a throwaway Postgres (PGlite): error reports and the access log
// are the doctor's alone, the access log can't be changed or deleted from the app, consent and message
// language save, and the nightly tidy-up deletes only what is old (a year of access log, 90 days of
// error reports, six months of website requests that never became a booking) and names their voice notes.
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder and run
// it from there (copy this file next to node_modules): node records.check.mjs <path to this repo>
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

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
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
  insert into auth.users values ('${A}', 'doctor@example.com'), ('${B}', 'other@example.com');
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`)
const as = async (who) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false); set role authenticated;`)
const admin = async () => db.exec('reset role')
const rows = async (sql) => (await db.query(sql)).rows
const err = async (sql) => { try { await db.query(sql); return null } catch (e) { return e.message } }

try {
  await db.exec(read('schema.sql'))
  await db.exec(read('schema.sql'))
  await db.exec(read('records-2026-10.sql'))
  await db.exec(read('records-2026-10.sql'))
  ok('schema.sql applies twice, and the change file twice on top of it')
} catch (e) {
  bad('apply schema.sql and the change file', e)
}

await as(A)
const patient = (await rows(`insert into public.patients (name, consent_at, language) values ('Asha Rao', now(), 'kn') returning id, language`))[0]
check('consent and the Kannada language save', patient?.language === 'kn')
check('a language other than Kannada or Hindi is refused', (await err(`insert into public.patients (name, language) values ('Ravi', 'ta')`)) !== null)
await db.exec(`insert into public.app_errors (place, message) values ('/app', 'Something broke')`)
await db.exec(`insert into public.access_log (action, patient_id) values ('opened patient', '${patient.id}')`)
check('the doctor adds and reads his error reports and access log',
  (await rows(`select 1 from public.app_errors`)).length === 1 && (await rows(`select 1 from public.access_log`)).length === 1)
await db.exec(`update public.access_log set action = 'signed in'`)
await db.exec(`delete from public.access_log`)
check('the access log cannot be changed or deleted from the app', (await rows(`select action from public.access_log`))[0]?.action === 'opened patient')
check('an action the log does not know is refused', (await err(`insert into public.access_log (action) values ('looked around')`)) !== null)
check('the tidy-up cannot be run from the app', (await err(`select public.tidy_old_records()`)) !== null)

await as(B)
check('another login sees none of them', (await rows(`select 1 from public.app_errors union all select 1 from public.access_log`)).length === 0)

// Old and recent records, then the tidy-up as the nightly job runs it
await admin()
await db.exec(`
  insert into public.access_log (owner_id, at, action) values ('${A}', now() - interval '13 months', 'signed in'), ('${A}', now() - interval '11 months', 'signed in');
  insert into public.app_errors (owner_id, at, place, message) values ('${A}', now() - interval '100 days', '/app', 'old'), ('${A}', now() - interval '10 days', '/app', 'recent');
  insert into public.booking_requests (owner_id, name, phone, status, created_at, voice_note) values
    ('${A}', 'Old declined', '9845000001', 'declined', now() - interval '7 months', 'old-declined.webm'),
    ('${A}', 'Old waiting', '9845000002', 'new', now() - interval '7 months', null),
    ('${A}', 'Old booked', '9845000003', 'booked', now() - interval '7 months', 'old-booked.webm'),
    ('${A}', 'Recent declined', '9845000004', 'declined', now() - interval '5 months', 'recent.webm');
`)
const removed = (await rows(`select v from public.tidy_old_records() v`)).map((r) => r.v)
check('the tidy-up names the voice notes of the requests it deleted', JSON.stringify(removed.filter(Boolean).sort()) === '["old-declined.webm"]', JSON.stringify(removed))
check('access log kept for a year', JSON.stringify((await rows(`select at > now() - interval '1 year' as kept from public.access_log where action = 'signed in'`)).map((r) => r.kept)) === '[true]')
const left = (await rows(`select name from public.booking_requests order by name`)).map((r) => r.name)
check('website requests: never booked and over six months old go, booked and recent ones stay', JSON.stringify(left) === '["Old booked","Recent declined"]', JSON.stringify(left))
check('error reports older than 90 days go', (await rows(`select 1 from public.app_errors where message = 'old'`)).length === 0)

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
