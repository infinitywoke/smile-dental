// Checks multi-clinic slice 4 (supabase/multi-clinic-4-2026-10.sql) in a throwaway Postgres (PGlite): each
// clinic's website names it by its slug, and gets only that clinic's free times, pause and price list; a request
// lands in its clinic, with the limits per clinic; the versions without a slug still serve Smile Dental Clinic;
// any member pauses their own clinic; notifications reach every member of the clinic with a phone, once each,
// and nobody else.
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder and run
// it from there (copy this file next to node_modules): node public.check.mjs <path to this repo>
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

const A = '11111111-1111-1111-1111-111111111111' // Dr. Rahil (Smile Dental Clinic, app_config's)
const B = '22222222-2222-2222-2222-222222222222' // another clinic's dentist
const C = '33333333-3333-3333-3333-333333333333' // an assistant at Smile Dental Clinic
const SECRET = 's'.repeat(40)
const SMILE = 'smile-dental-katapadi'
const NOW = '2027-01-04T03:00:00Z' // Monday 8:30 AM in India
const T1030 = '2027-01-04T05:00:00Z'
const T1130 = '2027-01-04T06:00:00Z'
const T1200 = '2027-01-04T06:30:00Z'

const db = new PGlite({ extensions: { btree_gist } })
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage; create schema vault;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  insert into vault.decrypted_secrets values ('clinic_os_cron', '${SECRET}');
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  insert into auth.users values ('${A}', 'smiledental8925@gmail.com'), ('${B}', 'other@example.com'), ('${C}', 'assistant@example.com');
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

const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const all = async (sql, params) => (await db.query(sql, params)).rows
const err = async (sql, params) => { try { await db.query(sql, params); return null } catch (e) { return e.message } }
const as = async (who) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false); set role ${who ? 'authenticated' : 'anon'};`)
const clinicOf = async (who) => (await one(`select clinic_id::text c from public.clinic_members where user_id = '${who}' and role = 'owner'`)).c

const clinicA = await clinicOf(A)
// C joins Smile Dental Clinic as an assistant (the seed made C a clinic of its own; this is the one that counts)
await db.exec(`delete from public.clinic_members where user_id = '${C}';
  insert into public.clinic_members (clinic_id, user_id, role) values ('${clinicA}', '${C}', 'assistant');`)
const OTHER = (await one(`select c.slug from public.clinics c join public.clinic_members m on m.clinic_id = c.id where m.user_id = '${B}'`)).slug
await db.exec(`insert into public.patients (id, owner_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', '${A}', 'Asha Rao');
  insert into public.appointments (owner_id, patient_id, starts_at, duration_min, status) values ('${A}', 'aaaaaaaa-0000-0000-0000-000000000001', '${T1030}', 30, 'booked');`)

// Free times: each clinic's own
const slots = async (slug) => (await all(`select slot_start::text s from public.get_open_slots($1, '2027-01-04'::date, 1)`, [slug])).map((r) => new Date(r.s).toISOString())
const smileSlots = await slots(SMILE)
const otherSlots = await slots(OTHER)
check("Smile Dental Clinic's website doesn't offer Dr. Rahil's booked time", smileSlots.length > 0 && !smileSlots.includes(new Date(T1030).toISOString()))
check("…the other clinic's does (it has nothing booked)", otherSlots.includes(new Date(T1030).toISOString()))
check('a clinic nobody knows has no free times', (await slots('no-such-clinic')).length === 0)
check('without a slug, the free times are still Smile Dental Clinic\'s',
  JSON.stringify((await all(`select slot_start::text s from public.get_open_slots('2027-01-04'::date, 1)`)).map((r) => new Date(r.s).toISOString())) === JSON.stringify(smileSlots))

// The pause: any member pauses their own clinic, and only it
await as(B)
await db.exec(`select public.set_booking_pause('infinity')`)
await db.exec('reset role')
check("a paused clinic's website offers no time, and says until when",
  (await slots(OTHER)).length === 0 && (await one(`select public.booking_paused_until($1)::text p`, [OTHER])).p === 'infinity')
check('…and the other clinic stays open', (await slots(SMILE)).length === smileSlots.length && (await one(`select public.booking_paused_until() p`)).p === null)
// By name, as the website's calls through the API are (the two versions differ by p_clinic)
const submit = (slug, name, phone, at) => `select public.submit_booking_request(${slug === null ? '' : `p_clinic => '${slug}', `}p_name => '${name}',
  p_phone => '${phone}', p_address => null, p_medical_alerts => null, p_heard_from => null, p_reason => 'Check-up', p_notes => null,
  p_requested_start => '${at}') id`
await as('')
check('a request to a paused clinic is turned away', (await err(submit(OTHER, 'Ravi Kumar', '9876543210', T1130)))?.includes('paused'))
await as(B)
await db.exec(`select public.set_booking_pause(null)`)
await as(C)
await db.exec(`select public.set_booking_pause('infinity')`)
await db.exec('reset role')
check("an assistant pauses their own clinic's booking", (await one(`select public.booking_paused_until($1)::text p`, [SMILE])).p === 'infinity' && (await slots(OTHER)).length > 0)
await as(C)
await db.exec(`select public.set_booking_pause(null)`)

// Requests: into their clinic, the limits per clinic
await as('')
const reqA = (await one(submit(SMILE, 'Ravi Kumar', '9876543210', T1130))).id
const reqB = (await one(submit(OTHER, 'Ravi Kumar', '9876543210', T1130))).id
await db.exec('reset role')
const landed = async (id) => one(`select r.clinic_id::text c, r.owner_id::text o from public.booking_requests r where r.id = '${id}'`)
check("a request to Smile Dental Clinic lands in it, Dr. Rahil's", JSON.stringify(await landed(reqA)) === JSON.stringify({ c: clinicA, o: A }))
check("the same number's request to another clinic lands there (the limits are each clinic's)", (await landed(reqB)).o === B)
await as('')
check("…but a second one waiting at the same clinic is turned away", (await err(submit(SMILE, 'Ravi Kumar', '9876543210', T1200)))?.includes('already have a request waiting'))
check('a clinic nobody knows takes no request', (await err(submit('no-such-clinic', 'Meera Shetty', '9123456780', T1200)))?.includes('not set up yet'))
const reqOld = (await one(submit(null, 'Meera Shetty', '9123456780', T1200))).id
await db.exec('reset role')
check('without a slug, a request still lands in Smile Dental Clinic', (await landed(reqOld)).c === clinicA)

// The price list each website shows
await db.exec(`insert into public.price_list (owner_id, line_no, slug, treatment, detail, cost) values
  ('${A}', 1, 'x-ray', 'X-Ray', 'Standard', '350/-'), ('${B}', 1, 'scaling', 'Scaling', 'Mild', '500/-')`)
const list = async (slug) => (await all(`select treatment from public.public_price_list($1)`, [slug])).map((r) => r.treatment).join()
check('each website shows its own clinic\'s price list', (await list(SMILE)) === 'X-Ray' && (await list(OTHER)) === 'Scaling'
  && (await all('select treatment from public.public_price_list()')).map((r) => r.treatment).join() === 'X-Ray')

// Notifications: every member of the clinic with a phone, once each, and nobody else
await db.exec(`insert into public.push_subscriptions (owner_id, endpoint, p256dh, auth) values
  ('${A}', 'https://push.example/a', 'k', 'a'), ('${C}', 'https://push.example/c', 'k', 'a'), ('${B}', 'https://push.example/b', 'k', 'a')`)
await as('')
const newFor = async (id) => (await one(`select public.notify_new_request_all('${SECRET}', '${id}') n`)).n
const firstTime = await newFor(reqA)
check("a new request reaches Dr. Rahil and his assistant (each their own phone), not the other clinic",
  firstTime?.length === 2 && firstTime.map((t) => t.subscriptions[0].endpoint).sort().join() === 'https://push.example/a,https://push.example/c'
    && firstTime.every((t) => t.items[0].kind === 'new_request' && t.items[0].name === 'Ravi Kumar'), JSON.stringify(firstTime))
check('…once each', (await newFor(reqA)) === null)
check("the other clinic's request reaches only its dentist", (await newFor(reqB))?.map((t) => t.subscriptions[0].endpoint).join() === 'https://push.example/b')
check('a wrong secret is refused', (await err(`select public.notify_new_request_all('${'x'.repeat(40)}', '${reqA}')`)) !== null)
await db.exec(`reset role; update public.booking_requests set created_at = '${NOW}'::timestamptz - interval '40 minutes';
  create or replace function public.clinic_now() returns timestamptz language sql stable as $$ select '2027-01-04T03:00:00Z'::timestamptz $$;`)
await as('')
const due = await one(`select public.notify_due_all('${SECRET}') d`)
const byPhone = Object.fromEntries((due.d ?? []).map((t) => [t.subscriptions[0].endpoint, t.items]))
const brief = (items) => items?.find((i) => i.kind === 'morning_brief')
const waiting = (items) => (items ?? []).filter((i) => i.kind === 'waiting_request').map((i) => i.name).sort().join()
check("the morning brief, each clinic's own: Smile Dental's has Dr. Rahil's booking and its two waiting requests",
  brief(byPhone['https://push.example/a'])?.booked === 1 && brief(byPhone['https://push.example/a'])?.waiting === 2
    && brief(byPhone['https://push.example/c'])?.booked === 1 && brief(byPhone['https://push.example/b'])?.booked === 0, JSON.stringify(due.d))
check('requests still waiting reach each member of their clinic', waiting(byPhone['https://push.example/a']) === 'Meera Shetty,Ravi Kumar'
  && waiting(byPhone['https://push.example/c']) === 'Meera Shetty,Ravi Kumar' && waiting(byPhone['https://push.example/b']) === 'Ravi Kumar')
check('…each once', (await one(`select public.notify_due_all('${SECRET}') d`)).d === null)
await db.exec('reset role')

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
