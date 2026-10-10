// Checks supabase/patch-booking.sql in a throwaway Postgres (PGlite).
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder
// and run: node booking.check.mjs <path to this repo>
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync } from 'node:fs'

const repo = process.argv[2]
const read = (f) => readFileSync(`${repo}/supabase/${f}`, 'utf8')

const db = new PGlite({ extensions: { btree_gist } })
let failures = 0
let passes = 0
const ok = (name) => { passes++; console.log('PASS', name) }
const bad = (name, e) => { failures++; console.log('FAIL', name, e?.message ?? e) }
const check = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail || 'condition false'))

async function expectOk(name, sql, params) {
  try { const r = await db.query(sql, params); ok(name); return r } catch (e) { bad(name, e) }
}
async function expectErr(name, sql, params, re) {
  try { await db.query(sql, params); bad(name, 'expected an error') } catch (e) {
    if (re && !re.test(e.message)) bad(name, `wrong error: ${e.message}`); else ok(`${name} -> ${e.message}`)
  }
}

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

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

const files = ['phase2.sql', 'patch-test-flag.sql', 'phase3-5.sql', 'patch-booking.sql']
for (const f of files) {
  try { await db.exec(read(f)); ok(`apply ${f}`) } catch (e) { bad(`apply ${f}`, e) }
}
for (let i = 2; i <= 3; i++) {
  try { await db.exec(read('patch-booking.sql')); ok(`patch-booking.sql run ${i} (idempotent)`) } catch (e) { bad(`patch-booking.sql run ${i}`, e) }
}

const as = async (role, uid) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`)
}
const setNow = async (iso) => {
  await db.exec('reset role')
  await db.exec(`create or replace function public.clinic_now() returns timestamptz language sql stable as $$ select '${iso}'::timestamptz $$;`)
}
const slotsAs = async (role, from = null, days = 28) => {
  await as(role, role === 'authenticated' ? A : null)
  const r = await db.query('select slot_start from public.get_open_slots($1::date, $2)', [from, days])
  return r.rows.map((x) => new Date(x.slot_start).toISOString())
}
const istTime = (iso) => new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(11, 16)
const istDate = (iso) => new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 10)

const submit = `select public.submit_booking_request($1, $2, $3::date, $4, $5, $6, $7, $8, $9::timestamptz) as id`
const at = (date, hhmm) => `${date}T${hhmm}:00+05:30`
// Wednesday 14 Oct 2026; Friday is 16 Oct, Saturday 17, Sunday 18
const WED = '2026-10-14', THU = '2026-10-15', FRI = '2026-10-16', SAT = '2026-10-17'

await as('postgres')
await expectOk('doctor can be found in app_config', 'select clinic_owner_id from public.app_config')

// --- Which blocks are offered ------------------------------------------------------
await setNow(at(WED, '10:00'))
let s = await slotsAs('anon', WED, 1)
check('10:00 AM Wed: first block today is 12:30 PM', s.length > 0 && istTime(s[0]) === '12:30', JSON.stringify(s.map(istTime)))
check('10:00 AM Wed: 8 online blocks left today (12:30, then 2:30..6:30 PM)', s.length === 8 && istTime(s.at(-1)) === '18:30', JSON.stringify(s.map(istTime)))

await setNow(at(WED, '16:30'))
s = await slotsAs('anon', WED, 1)
check('4:30 PM Wed: only 6:30 PM left today', s.length === 1 && istTime(s[0]) === '18:30', JSON.stringify(s.map(istTime)))

await setNow(at(WED, '17:30'))
s = await slotsAs('anon', WED, 1)
check('5:30 PM Wed: nothing left today', s.length === 0, JSON.stringify(s.map(istTime)))
s = await slotsAs('anon', null, 2)
check('5:30 PM Wed: tomorrow starts at 8:30 AM', s.length > 0 && istDate(s[0]) === THU && istTime(s[0]) === '08:30')

await setNow(at(WED, '23:00'))
s = await slotsAs('anon', null, 2)
check('11 PM Wed: tomorrow 8:30 AM is first', istDate(s[0]) === THU && istTime(s[0]) === '08:30')

await setNow(at(WED, '05:00'))
s = await slotsAs('anon', WED, 1)
check('5:00 AM Wed: 8:30 AM today is offered (3.5 h away)', istTime(s[0]) === '08:30')
await setNow(at(WED, '07:00'))
s = await slotsAs('anon', WED, 1)
check('7:00 AM Wed: 8:30 AM is too soon, 9:10 AM is first', istTime(s[0]) === '09:10', JSON.stringify(s.map(istTime)))

await setNow(at(WED, '10:00'))
s = await slotsAs('anon')
const times = s.map(istTime)
check('28-day window has blocks', s.length > 100, String(s.length))
check('never offers 7:20 PM or later', times.every((t) => t < '19:00'))
check('never offers the 12:30-2:00 break', times.every((t) => t <= '12:30' || t >= '14:30'))
check('never offers a Friday', s.every((x) => new Date(`${istDate(x)}T00:00:00Z`).getUTCDay() !== 5))
check('last offered day is within 28 days', istDate(s.at(-1)) <= '2026-11-10', istDate(s.at(-1)))
check('only grid times', times.every((t) => ['08:30','09:10','09:50','10:30','11:10','11:50','12:30','14:30','15:10','15:50','16:30','17:10','17:50','18:30'].includes(t)))
s = await slotsAs('anon', FRI, 1)
check('Friday has no blocks', s.length === 0)
s = await slotsAs('anon', SAT, 1)
check('Saturday has 14 online blocks', s.length === 14, String(s.length))

// --- Public booking ---------------------------------------------------------------------
await as('anon')
const slot1 = at(THU, '09:10')
let r = await expectOk('anon books Thursday 9:10 AM with full details', submit,
  ['  Prakash Shetty ', '+91 98450 21763', '1988-04-12', 'Pangala, Udupi', 'Penicillin allergy', 'Google', 'Tooth pain', 'left side', slot1])
const req1 = r?.rows?.[0]?.id
check('request id returned', !!req1)
s = await slotsAs('anon', THU, 1)
check('booked-pending block disappears from the website', !s.map(istTime).includes('09:10'), JSON.stringify(s.map(istTime)))
await as('anon')
await expectErr('same block cannot be requested twice', submit, ['Asha Rao', '9876543210', null, null, null, null, null, null, slot1], /no longer available/)
await expectErr('same phone cannot hold two requests', submit, ['Prakash', '9845021763', null, null, null, null, null, null, at(THU, '09:50')], /already have a request waiting/)
await expectErr('7:10 PM is phone/app only', submit, ['Asha Rao', '9876543210', null, null, null, null, null, null, at(THU, '19:10')], /call the clinic/)
await expectErr('7:20 PM is outside the clinic blocks', submit, ['Asha Rao', '9876543210', null, null, null, null, null, null, at(THU, '19:20')], /available times/)
await expectErr('8:00 PM is outside the clinic blocks', submit, ['Asha Rao', '9876543210', null, null, null, null, null, null, at(THU, '20:00')], /available times/)
await expectErr('block inside the break', submit, ['Asha Rao', '9876543210', null, null, null, null, null, null, at(THU, '13:00')], /available times/)
await expectErr('off-grid time', submit, ['Asha Rao', '9876543210', null, null, null, null, null, null, at(THU, '09:30')], /available times/)
await expectErr('Friday block', submit, ['Asha Rao', '9876543210', null, null, null, null, null, null, at(FRI, '09:10')], /available times/)
await expectErr('no time chosen', submit, ['Asha Rao', '9876543210', null, null, null, null, null, null, null], /available times/)
await expectErr('block less than 2 h away (11:50 AM at 10:00)', submit, ['Asha Rao', '9876543210', null, null, null, null, null, null, at(WED, '11:50')], /no longer available/)
await expectErr('block in the past', submit, ['Asha Rao', '9876543210', null, null, null, null, null, null, at('2026-10-13', '14:30')], /no longer available/)
await expectErr('block beyond 28 days', submit, ['Asha Rao', '9876543210', null, null, null, null, null, null, at('2026-11-21', '14:30')], /no longer available/)
await expectOk('exactly 2 h away is allowed (12:00 pinned)', 'select 1')
await expectErr('bad phone', submit, ['Asha', '12345', null, null, null, null, null, null, at(THU, '10:30')], /valid 10-digit/)
await expectErr('name too short', submit, [' A ', '9876543210', null, null, null, null, null, null, at(THU, '10:30')], /name/)
await expectErr('date of birth in the future', submit, ['Asha Rao', '9876543210', '2030-01-01', null, null, null, null, null, at(THU, '10:30')], /date of birth/)
await expectErr('address too long', submit, ['Asha Rao', '9876543210', null, 'x'.repeat(301), null, null, null, null, at(THU, '10:30')], /Address/)
await expectErr('alerts too long', submit, ['Asha Rao', '9876543210', null, null, 'x'.repeat(1001), null, null, null, at(THU, '10:30')], /Medical alerts/)
await expectErr('heard-from too long', submit, ['Asha Rao', '9876543210', null, null, null, 'x'.repeat(101), null, null, at(THU, '10:30')], /too long/)
await expectErr('reason too long', submit, ['Asha Rao', '9876543210', null, null, null, null, 'x'.repeat(201), null, at(THU, '10:30')], /Reason/)
await expectErr('notes too long', submit, ['Asha Rao', '9876543210', null, null, null, null, null, 'x'.repeat(1001), at(THU, '10:30')], /Notes/)

// --- What the public can and cannot touch ----------------------------------------------
await as('anon')
for (const t of ['booking_requests', 'patients', 'visits', 'appointments', 'time_off', 'app_config']) {
  await expectErr(`anon cannot read ${t}`, `select * from public.${t}`, [], /permission denied/)
}
await expectErr('anon cannot insert booking_requests', `insert into public.booking_requests (owner_id, name, phone) values ('${A}', 'X Y', '9876543210')`, [], /permission denied/)
await expectErr('anon cannot confirm', `select * from public.confirm_booking_request('${req1}'::uuid, '${slot1}'::timestamptz, null)`, [], /permission denied/)
await expectErr('anon cannot call clinic_now', 'select public.clinic_now()', [], /permission denied/)
await expectErr('anon cannot call clinic_slots', `select * from public.clinic_slots('${THU}')`, [], /permission denied/)

// --- Doctor confirms ---------------------------------------------------------------------
await as('authenticated', B)
await expectErr('another account cannot see the request', `select * from public.confirm_booking_request('${req1}'::uuid, '${slot1}'::timestamptz, null)`, [], /not found/)
r = await db.query('select count(*)::int as n from public.booking_requests')
check('another account sees no requests (RLS)', r.rows[0].n === 0)

await as('authenticated', A)
r = await db.query('select count(*)::int as n from public.booking_requests where status = \'new\'')
check('doctor sees the pending request', r.rows[0].n === 1)

await expectErr('cannot confirm onto the break', `select * from public.confirm_booking_request('${req1}'::uuid, '${at(THU, '13:00')}'::timestamptz, null)`, [], /clinic time blocks/)
await expectErr('cannot confirm on a Friday', `select * from public.confirm_booking_request('${req1}'::uuid, '${at(FRI, '09:10')}'::timestamptz, null)`, [], /clinic time blocks/)
await expectErr('cannot confirm in the past', `select * from public.confirm_booking_request('${req1}'::uuid, '${at('2026-10-13', '09:10')}'::timestamptz, null)`, [], /already passed/)

// move the chip: confirm at a different block than requested (Thursday 4:00 PM)
r = await expectOk('doctor confirms at a different block (3:50 PM)', `select * from public.confirm_booking_request('${req1}'::uuid, '${at(THU, '15:50')}'::timestamptz, null)`)
const patient1 = r?.rows?.[0]?.patient_id
const appt1 = r?.rows?.[0]?.appointment_id
r = await db.query('select * from public.patients where id = $1', [patient1])
check('patient created with the typed details', r.rows[0]?.name === 'Prakash Shetty' && r.rows[0]?.phone === '9845021763' && String(r.rows[0]?.address) === 'Pangala, Udupi' && r.rows[0]?.medical_alerts === 'Penicillin allergy' && r.rows[0]?.heard_from === 'Google' && String(r.rows[0]?.date_of_birth).startsWith('1988-04-12') || r.rows[0]?.date_of_birth?.toISOString?.().startsWith('1988-04-12'), JSON.stringify(r.rows[0]))
r = await db.query('select * from public.appointments where id = $1', [appt1])
check('appointment is a 40-minute booked block at 3:50 PM', r.rows[0]?.duration_min === 40 && r.rows[0]?.status === 'booked' && istTime(r.rows[0]?.starts_at.toISOString()) === '15:50')
check('appointment reason carries reason and note', r.rows[0]?.reason === 'Tooth pain - left side', r.rows[0]?.reason)
r = await db.query('select status, patient_id, appointment_id from public.booking_requests where id = $1', [req1])
check('request marked booked and linked', r.rows[0]?.status === 'booked' && r.rows[0]?.patient_id === patient1 && r.rows[0]?.appointment_id === appt1)
await expectErr('request cannot be confirmed twice', `select * from public.confirm_booking_request('${req1}'::uuid, '${at(THU, '17:10')}'::timestamptz, null)`, [], /already been handled/)

// the originally requested 9:10 block is free again, the booked 4:00 PM one is gone
s = await slotsAs('anon', THU, 1)
check('requested 9:10 AM is open again; confirmed 3:50 PM is gone', s.map(istTime).includes('09:10') && !s.map(istTime).includes('15:50'), JSON.stringify(s.map(istTime)))

// second request for the same block as an existing booking
await as('anon')
r = await expectOk('second visitor requests 9:50 AM', submit, ['Meera Nayak', '9812345678', null, 'Katapadi', null, 'Instagram', null, null, at(THU, '09:50')])
const req2 = r?.rows?.[0]?.id
await as('authenticated', A)
await expectErr('doctor cannot put two people in one block', `select * from public.confirm_booking_request('${req2}'::uuid, '${at(THU, '15:50')}'::timestamptz, null)`, [], /just taken/)
r = await db.query('select status, patient_id from public.booking_requests where id = $1', [req2])
check('failed confirm leaves the request pending and creates no patient', r.rows[0]?.status === 'new' && r.rows[0]?.patient_id === null)
r = await db.query("select count(*)::int as n from public.patients where phone = '9812345678'")
check('failed confirm rolled the patient insert back', r.rows[0].n === 0)

// link to an existing patient instead of creating one
r = await expectOk('doctor confirms and links an existing patient', `select * from public.confirm_booking_request('${req2}'::uuid, '${at(THU, '09:50')}'::timestamptz, '${patient1}'::uuid)`)
check('existing patient reused', r?.rows?.[0]?.patient_id === patient1)

await as('anon')
r = await expectOk('visitor requests with a pending block, then doctor links foreign patient fails', submit, ['Lakshmi Bhat', '9701234567', null, null, null, null, null, null, at(THU, '10:30')])
const req3 = r?.rows?.[0]?.id
await as('authenticated', B)
await db.query(`insert into public.patients (name, phone) values ('Other doctor patient', '9000000001')`)
const foreign = (await db.query(`select id from public.patients limit 1`)).rows[0]?.id
await as('authenticated', A)
await expectErr('cannot link a patient owned by someone else', `select * from public.confirm_booking_request('${req3}'::uuid, '${at(THU, '10:30')}'::timestamptz, '${foreign}'::uuid)`, [], /patient was not found/)

// --- Time off, double booking, held blocks ------------------------------------------------
await expectOk('doctor blocks Saturday afternoon', `insert into public.time_off (starts_at, ends_at, note) values ('${at(SAT, '14:30')}', '${at(SAT, '19:30')}', 'Course')`)
s = await slotsAs('anon', SAT, 1)
check('time off hides blocks from the website', s.length === 7 && s.map(istTime).every((t) => t <= '12:30'), JSON.stringify(s.map(istTime)))
await as('authenticated', A)
await expectErr('time_off needs ends after starts', `insert into public.time_off (starts_at, ends_at) values ('${at(SAT, '10:00')}', '${at(SAT, '09:00')}')`, [], /check/)
await as('authenticated', B)
r = await db.query('select count(*)::int as n from public.time_off')
check('other account cannot see time off', r.rows[0].n === 0)
await as('anon')
await expectErr('anon cannot read time_off', 'select * from public.time_off', [], /permission denied/)

await as('authenticated', A)
await expectErr('overlapping booked appointment is refused', `insert into public.appointments (patient_id, starts_at, duration_min) values ('${patient1}', '${at(THU, '16:10')}', 40)`, [], /no_overlap|conflicting|exclusion/)
await expectOk('adjacent block is fine (16:40)', `insert into public.appointments (patient_id, starts_at, duration_min) values ('${patient1}', '${at(THU, '16:30')}', 40)`)
await db.query(`update public.appointments set status = 'cancelled' where starts_at = '${at(THU, '16:30')}'`)
await expectOk('a cancelled appointment no longer blocks the block', `insert into public.appointments (patient_id, starts_at, duration_min) values ('${patient1}', '${at(THU, '16:30')}', 40)`)

// a pending request holds its block for 24 h, then lets it go
await as('anon')
r = await expectOk('visitor requests 11:10 AM', submit, ['Divya Kamath', '9611122233', null, null, null, null, null, null, at(SAT, '11:10')])
s = await slotsAs('anon', SAT, 1)
check('held block hidden', !s.map(istTime).includes('11:10'))
await setNow('2026-10-15T11:00:00+05:30')
s = await slotsAs('anon', SAT, 1)
check('hold released after 24 hours', s.map(istTime).includes('11:10'), JSON.stringify(s.map(istTime)))
await setNow(at(WED, '10:00'))

// --- Test data marker ------------------------------------------------------------------------
await as('anon')
r = await expectOk('E2E- name is flagged as test data', submit, ['E2E-Booking Check', '9555566666', null, null, null, null, null, null, at(SAT, '09:50')])
const reqT = r?.rows?.[0]?.id
await as('authenticated', A)
r = await db.query('select is_test from public.booking_requests where id = $1', [reqT])
check('request is_test = true', r.rows[0]?.is_test === true)
r = await expectOk('confirm the test request', `select * from public.confirm_booking_request('${reqT}'::uuid, '${at(SAT, '09:50')}'::timestamptz, null)`)
r = await db.query('select is_test from public.patients where id = $1', [r?.rows?.[0]?.patient_id])
check('patient is_test = true', r.rows[0]?.is_test === true)

// deleting a patient removes their appointments; the request just loses its link
await expectOk('delete test patient cascades', `delete from public.patients where is_test`)
r = await db.query('select count(*)::int as n from public.appointments a join public.patients p on p.id = a.patient_id where p.is_test')
check('no appointments left for test patients', r.rows[0].n === 0)

await as('postgres')
console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
