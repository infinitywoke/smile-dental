// Checks supabase/schema.sql in a throwaway Postgres (PGlite): the booking rules, the calendar and what the public may touch.
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder
// and run it from there (copy this file next to node_modules): node booking.check.mjs <path to this repo>
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

for (let i = 1; i <= 2; i++) {
  try { await db.exec(read('schema.sql')); ok(`apply schema.sql (run ${i}, safe to repeat)`) } catch (e) { bad(`apply schema.sql run ${i}`, e) }
}

// The tables and columns the clean-up removed are not in the schema
{
  const gone = await db.query(`select table_name, column_name from information_schema.columns where table_schema = 'public'
    and (table_name in ('reminder_log','expenses','recurring_expenses','day_closes','treatment_items')
      or column_name in ('date_of_birth','is_test','preferred_times','preferred_date','preferred_time','is_emergency','area','city','reminder_sent_at','treatment_item_id','summary','notes_original','confirmed_at','reference'))`)
  check('removed tables and columns are not in schema.sql', gone.rows.length === 0, JSON.stringify(gone.rows))
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

const submit = `select public.submit_booking_request($1, $2, $3, $4, $5, $6, $7, $8::timestamptz) as id`
const at = (date, hhmm) => `${date}T${hhmm}:00+05:30`
// Wednesday 14 Oct 2026; Friday is 16 Oct, Saturday 17, Sunday 18
const WED = '2026-10-14', THU = '2026-10-15', FRI = '2026-10-16', SAT = '2026-10-17'

await as('postgres')
await expectOk('doctor can be found in app_config', 'select clinic_owner_id from public.app_config')

// --- Which blocks are offered ------------------------------------------------------
// No notice needed (since 21 Oct 2026): any block that hasn't started is offered
await setNow(at(WED, '10:00'))
let s = await slotsAs('anon', WED, 1)
check('10:00 AM Wed: first block today is 10:30 AM', s.length > 0 && istTime(s[0]) === '10:30', JSON.stringify(s.map(istTime)))
check('10:00 AM Wed: 14 online blocks left today (10:30..12:30, then 2:30..6:30 PM)', s.length === 14 && istTime(s.at(-1)) === '18:30', JSON.stringify(s.map(istTime)))
await setNow(at(WED, '10:30'))
s = await slotsAs('anon', WED, 1)
check('10:30 AM Wed: the 10:30 block has started, 11:00 is first', istTime(s[0]) === '11:00', JSON.stringify(s.map(istTime)))

await setNow(at(WED, '16:30'))
s = await slotsAs('anon', WED, 1)
check('4:30 PM Wed: 5:00, 5:30, 6:00 and 6:30 PM left today', s.map(istTime).join() === '17:00,17:30,18:00,18:30', JSON.stringify(s.map(istTime)))

await setNow(at(WED, '18:30'))
s = await slotsAs('anon', WED, 1)
check('6:30 PM Wed: nothing left today', s.length === 0, JSON.stringify(s.map(istTime)))
s = await slotsAs('anon', null, 2)
check('6:30 PM Wed: tomorrow starts at 8:30 AM', s.length > 0 && istDate(s[0]) === THU && istTime(s[0]) === '08:30')

await setNow(at(WED, '23:00'))
s = await slotsAs('anon', null, 2)
check('11 PM Wed: tomorrow 8:30 AM is first', istDate(s[0]) === THU && istTime(s[0]) === '08:30')

await setNow(at(WED, '05:00'))
s = await slotsAs('anon', WED, 1)
check('5:00 AM Wed: 8:30 AM today is offered (3.5 h away)', istTime(s[0]) === '08:30')
await setNow(at(WED, '07:00'))
s = await slotsAs('anon', WED, 1)
check('7:00 AM Wed: 8:30 AM is offered (no notice needed)', istTime(s[0]) === '08:30', JSON.stringify(s.map(istTime)))

await setNow(at(WED, '10:00'))
s = await slotsAs('anon')
const times = s.map(istTime)
check('28-day window has blocks', s.length > 100, String(s.length))
check('never offers 7 PM or later', times.every((t) => t < '19:00'))
check('never offers the 12:30-2:00 break', times.every((t) => t <= '12:30' || t >= '14:30'))
check('never offers a Friday', s.every((x) => new Date(`${istDate(x)}T00:00:00Z`).getUTCDay() !== 5))
check('last offered day is within 28 days', istDate(s.at(-1)) <= '2026-11-10', istDate(s.at(-1)))
check('only grid times', times.every((t) => ['08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30'].includes(t)))
s = await slotsAs('anon', FRI, 1)
check('Friday has no blocks', s.length === 0)
s = await slotsAs('anon', SAT, 1)
check('Saturday has 18 online blocks', s.length === 18, String(s.length))

// --- Public booking ---------------------------------------------------------------------
await as('anon')
const slot1 = at(THU, '09:00')
let r = await expectOk('anon books Thursday 9:00 AM with full details', submit,
  ['  Prakash Shetty ', '+91 98450 21763', 'Pangala, Udupi', 'Penicillin allergy', 'Google', 'Tooth pain', 'left side', slot1])
const req1 = r?.rows?.[0]?.id
check('request id returned', !!req1)
s = await slotsAs('anon', THU, 1)
check('a new request holds nothing until its WhatsApp is received', s.map(istTime).includes('09:00'), JSON.stringify(s.map(istTime)))
await as('authenticated', A)
await db.query(`update public.booking_requests set received_at = public.clinic_now() where id = '${req1}'`)
s = await slotsAs('anon', THU, 1)
check('received: its block disappears from the website', !s.map(istTime).includes('09:00'), JSON.stringify(s.map(istTime)))
await as('anon')
await expectErr('same block cannot be requested twice', submit, ['Asha Rao', '9876543210', null, null, null, null, null, slot1], /no longer available/)
await expectErr('same phone cannot hold two requests', submit, ['Prakash', '9845021763', null, null, null, null, null, at(THU, '09:30')], /already have a request waiting/)
await expectErr('7:00 PM is phone/app only', submit, ['Asha Rao', '9876543210', null, null, null, null, null, at(THU, '19:00')], /call the clinic/)
await expectErr('7:30 PM is outside the clinic blocks', submit, ['Asha Rao', '9876543210', null, null, null, null, null, at(THU, '19:30')], /available times/)
await expectErr('8:00 PM is outside the clinic blocks', submit, ['Asha Rao', '9876543210', null, null, null, null, null, at(THU, '20:00')], /available times/)
await expectErr('block inside the break', submit, ['Asha Rao', '9876543210', null, null, null, null, null, at(THU, '13:00')], /available times/)
await expectErr('off-grid time', submit, ['Asha Rao', '9876543210', null, null, null, null, null, at(THU, '09:40')], /available times/)
await expectErr('Friday block', submit, ['Asha Rao', '9876543210', null, null, null, null, null, at(FRI, '09:00')], /available times/)
await expectErr('no time chosen', submit, ['Asha Rao', '9876543210', null, null, null, null, null, null], /available times/)
await expectErr('a block that has started (9:30 AM at 10:00) is refused', submit, ['Asha Rao', '9876543210', null, null, null, null, null, at(WED, '09:30')], /no longer available/)
// No notice needed: a block half an hour away is accepted (tried, then rolled back so later checks are unchanged)
await db.exec('begin')
await expectOk('a block 30 minutes away is accepted (10:30 AM at 10:00)', submit, ['Asha Rao', '9876500001', null, null, null, null, null, at(WED, '10:30')])
await db.exec('rollback')
await expectErr('block in the past', submit, ['Asha Rao', '9876543210', null, null, null, null, null, at('2026-10-13', '14:30')], /no longer available/)
await expectErr('block beyond 28 days', submit, ['Asha Rao', '9876543210', null, null, null, null, null, at('2026-11-21', '14:30')], /no longer available/)
await expectErr('bad phone', submit, ['Asha', '12345', null, null, null, null, null, at(THU, '10:30')], /valid 10-digit/)
await expectErr('name too short', submit, [' A ', '9876543210', null, null, null, null, null, at(THU, '10:30')], /name/)
await expectErr('address too long', submit, ['Asha Rao', '9876543210', 'x'.repeat(301), null, null, null, null, at(THU, '10:30')], /Address/)
await expectErr('alerts too long', submit, ['Asha Rao', '9876543210', null, 'x'.repeat(1001), null, null, null, at(THU, '10:30')], /Medical alerts/)
await expectErr('heard-from too long', submit, ['Asha Rao', '9876543210', null, null, 'x'.repeat(101), null, null, at(THU, '10:30')], /too long/)
await expectErr('reason too long', submit, ['Asha Rao', '9876543210', null, null, null, 'x'.repeat(201), null, at(THU, '10:30')], /Reason/)
await expectErr('notes too long', submit, ['Asha Rao', '9876543210', null, null, null, null, 'x'.repeat(1001), at(THU, '10:30')], /Notes/)

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
await expectErr('cannot confirm on a Friday', `select * from public.confirm_booking_request('${req1}'::uuid, '${at(FRI, '09:00')}'::timestamptz, null)`, [], /clinic time blocks/)
await expectErr('cannot confirm in the past', `select * from public.confirm_booking_request('${req1}'::uuid, '${at('2026-10-13', '09:00')}'::timestamptz, null)`, [], /already passed/)

// move the chip: confirm at a different block than requested (Thursday 3:30 PM)
r = await expectOk('doctor confirms at a different block (3:30 PM)', `select * from public.confirm_booking_request('${req1}'::uuid, '${at(THU, '15:30')}'::timestamptz, null)`)
const patient1 = r?.rows?.[0]?.patient_id
const appt1 = r?.rows?.[0]?.appointment_id
r = await db.query('select * from public.patients where id = $1', [patient1])
check('patient created with the typed details', r.rows[0]?.name === 'Prakash Shetty' && r.rows[0]?.phone === '9845021763' && String(r.rows[0]?.address) === 'Pangala, Udupi' && r.rows[0]?.medical_alerts === 'Penicillin allergy' && r.rows[0]?.heard_from === 'Google', JSON.stringify(r.rows[0]))
r = await db.query('select * from public.appointments where id = $1', [appt1])
check('appointment is a 30-minute booked block at 3:30 PM', r.rows[0]?.duration_min === 30 && r.rows[0]?.status === 'booked' && istTime(r.rows[0]?.starts_at.toISOString()) === '15:30')
check('appointment reason carries reason and note', r.rows[0]?.reason === 'Tooth pain - left side', r.rows[0]?.reason)
r = await db.query('select status, patient_id, appointment_id from public.booking_requests where id = $1', [req1])
check('request marked booked and linked', r.rows[0]?.status === 'booked' && r.rows[0]?.patient_id === patient1 && r.rows[0]?.appointment_id === appt1)
await expectErr('request cannot be confirmed twice', `select * from public.confirm_booking_request('${req1}'::uuid, '${at(THU, '17:00')}'::timestamptz, null)`, [], /already been handled/)

// the originally requested 9:00 block is free again, the booked 3:30 PM one is gone
s = await slotsAs('anon', THU, 1)
check('requested 9:00 AM is open again; confirmed 3:30 PM is gone', s.map(istTime).includes('09:00') && !s.map(istTime).includes('15:30'), JSON.stringify(s.map(istTime)))

// second request for the same block as an existing booking
await as('anon')
r = await expectOk('second visitor requests 9:30 AM', submit, ['Meera Nayak', '9812345678', 'Katapadi', null, 'Instagram', null, null, at(THU, '09:30')])
const req2 = r?.rows?.[0]?.id
await as('authenticated', A)
await expectErr('doctor cannot put two people in one block', `select * from public.confirm_booking_request('${req2}'::uuid, '${at(THU, '15:30')}'::timestamptz, null)`, [], /just taken/)
r = await db.query('select status, patient_id from public.booking_requests where id = $1', [req2])
check('failed confirm leaves the request pending and creates no patient', r.rows[0]?.status === 'new' && r.rows[0]?.patient_id === null)
r = await db.query("select count(*)::int as n from public.patients where phone = '9812345678'")
check('failed confirm rolled the patient insert back', r.rows[0].n === 0)

// link to an existing patient instead of creating one
r = await expectOk('doctor confirms and links an existing patient', `select * from public.confirm_booking_request('${req2}'::uuid, '${at(THU, '09:30')}'::timestamptz, '${patient1}'::uuid)`)
check('existing patient reused', r?.rows?.[0]?.patient_id === patient1)

await as('anon')
r = await expectOk('visitor requests with a pending block, then doctor links foreign patient fails', submit, ['Lakshmi Bhat', '9701234567', null, null, null, null, null, at(THU, '10:30')])
const req3 = r?.rows?.[0]?.id
await as('authenticated', B)
await db.query(`insert into public.patients (name, phone) values ('Other doctor patient', '9000000001')`)
const foreign = (await db.query(`select id from public.patients limit 1`)).rows[0]?.id
await as('authenticated', A)
await expectErr('cannot link a patient owned by someone else', `select * from public.confirm_booking_request('${req3}'::uuid, '${at(THU, '10:30')}'::timestamptz, '${foreign}'::uuid)`, [], /patient was not found/)

// --- Time off, double booking, held blocks ------------------------------------------------
await expectOk('doctor blocks Saturday afternoon', `insert into public.time_off (starts_at, ends_at, note) values ('${at(SAT, '14:30')}', '${at(SAT, '19:30')}', 'Course')`)
s = await slotsAs('anon', SAT, 1)
check('time off hides blocks from the website', s.length === 9 && s.map(istTime).every((t) => t <= '12:30'), JSON.stringify(s.map(istTime)))
await as('authenticated', A)
await expectErr('time_off needs ends after starts', `insert into public.time_off (starts_at, ends_at) values ('${at(SAT, '10:00')}', '${at(SAT, '09:00')}')`, [], /check/)
await as('authenticated', B)
r = await db.query('select count(*)::int as n from public.time_off')
check('other account cannot see time off', r.rows[0].n === 0)
await as('anon')
await expectErr('anon cannot read time_off', 'select * from public.time_off', [], /permission denied/)

await as('authenticated', A)
await expectErr('overlapping booked appointment is refused', `insert into public.appointments (patient_id, starts_at, duration_min) values ('${patient1}', '${at(THU, '15:45')}', 30)`, [], /no_overlap|conflicting|exclusion/)
await expectOk('adjacent block is fine (4:00 PM)', `insert into public.appointments (patient_id, starts_at, duration_min) values ('${patient1}', '${at(THU, '16:00')}', 30)`)
await db.query(`update public.appointments set status = 'cancelled' where starts_at = '${at(THU, '16:00')}'`)
await expectOk('a cancelled appointment no longer blocks the block', `insert into public.appointments (patient_id, starts_at, duration_min) values ('${patient1}', '${at(THU, '16:00')}', 30)`)

// a request holds its block only once its WhatsApp reached the clinic, for 2 hours (or until 10:30 AM
// on the next open day when that would run past closing), then lets it go
await as('anon')
r = await expectOk('visitor requests 11:00 AM', submit, ['Divya Kamath', '9611122233', null, null, null, null, null, at(SAT, '11:00')])
const divya = r?.rows?.[0]?.submit_booking_request ?? Object.values(r?.rows?.[0] ?? {})[0]
s = await slotsAs('anon', SAT, 1)
check('a request not received yet holds nothing', s.map(istTime).includes('11:00'), JSON.stringify(s.map(istTime)))
await as('authenticated', A)
await db.query(`update public.booking_requests set received_at = public.clinic_now() where id = '${divya}'`)
s = await slotsAs('anon', SAT, 1)
check('received: the block is held', !s.map(istTime).includes('11:00'))
await setNow(at(WED, '11:59'))
s = await slotsAs('anon', SAT, 1)
check('still held just under 2 hours later', !s.map(istTime).includes('11:00'))
await setNow(at(WED, '12:01'))
s = await slotsAs('anon', SAT, 1)
check('released after 2 hours', s.map(istTime).includes('11:00'), JSON.stringify(s.map(istTime)))
// received at 6:45 PM: 2 hours would end after closing, so it is held until 10:30 AM the next open day
await setNow(at(WED, '18:45'))
await as('authenticated', A)
await db.query(`update public.booking_requests set received_at = public.clinic_now() where id = '${divya}'`)
await setNow(at(THU, '10:29'))
s = await slotsAs('anon', SAT, 1)
check('held overnight until 10:30 AM', !s.map(istTime).includes('11:00'))
await setNow(at(THU, '10:31'))
s = await slotsAs('anon', SAT, 1)
check('released at 10:30 AM the next open day', s.map(istTime).includes('11:00'), JSON.stringify(s.map(istTime)))
await setNow(at(WED, '10:00'))

// deleting a patient removes their appointments; the request just loses its link
await as('authenticated', A)
r = await expectOk('delete the confirmed patient cascades', `delete from public.patients where id = '${patient1}' returning id`)
r = await db.query(`select count(*)::int as n from public.appointments where patient_id = '${patient1}'`)
check('no appointments left for the deleted patient', r.rows[0].n === 0)
r = await db.query(`select patient_id from public.booking_requests where id = '${req1}'`)
check('the request just loses its patient link', r.rows[0]?.patient_id === null)

// --- Gender -------------------------------------------------------------------------------------
await db.exec('reset role')
await as('anon')
const submitG = `select public.submit_booking_request($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9) as id`
r = await expectOk('visitor sends a request with gender', submitG, ['Gender Check', '9444455555', null, null, null, null, null, at(SAT, '10:30'), 'Female'])
const reqG = r?.rows?.[0]?.id
await expectErr('an unknown gender is refused', submitG, ['Gender Two', '9444455556', null, null, null, null, null, at(SAT, '11:00'), 'robot'], /female, male or other/)
r = await expectOk('the call without gender or age still works', submit, ['No Gender', '9444455557', null, null, null, null, null, at(SAT, '11:30')])
await as('authenticated', A)
r = await db.query('select gender from public.booking_requests where id = $1', [reqG])
check('request stores gender in lower case', r.rows[0]?.gender === 'female', JSON.stringify(r.rows))
r = await expectOk('confirm copies gender to the patient', `select * from public.confirm_booking_request('${reqG}'::uuid, '${at(SAT, '10:30')}'::timestamptz, null)`)
r = await db.query('select gender from public.patients where id = $1', [r?.rows?.[0]?.patient_id])
check('patient has the gender', r.rows[0]?.gender === 'female', JSON.stringify(r.rows))
await expectErr('patients refuse a gender outside the three', `update public.patients set gender = 'x' where gender = 'female'`, [], /check/)
await as('anon')
// The website's are the clinic's (eleven arguments, its slug first) and, until slice 4's clean-up, the old ten: nothing longer
await expectErr('no website booking function takes more', `select public.submit_booking_request('a','b',null,null,null,null,null,null,null,null,null,null)`, [], /does not exist|function/)

// --- Age as birth year --------------------------------------------------------------------------
await db.exec('reset role')
await as('anon')
const submitA = `select public.submit_booking_request($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10) as id`
r = await expectOk('visitor sends a request with an age (birth year)', submitA, ['Age Check', '9333344444', null, null, null, 'Tooth pain', null, at(SAT, '12:30'), 'male', 1988])
const reqA = r?.rows?.[0]?.id
await expectErr('a birth year before 1900 is refused', submitA, ['Age Two', '9333344445', null, null, null, null, null, at(SAT, '15:00'), 'male', 1800], /check the age/)
await expectErr('a birth year in the future is refused', submitA, ['Age Three', '9333344446', null, null, null, null, null, at(SAT, '15:00'), 'male', 2999], /check the age/)
r = await expectOk('the call with gender and no age still works', submitG, ['No Age', '9333344447', null, null, null, null, null, at(SAT, '09:00'), 'female'])
await as('authenticated', A)
r = await db.query('select birth_year from public.booking_requests where id = $1', [reqA])
check('request stores the birth year', r.rows[0]?.birth_year === 1988, JSON.stringify(r.rows))
r = await expectOk('confirm copies the birth year to the patient', `select * from public.confirm_booking_request('${reqA}'::uuid, '${at(SAT, '12:30')}'::timestamptz, null)`)
r = await db.query('select birth_year from public.patients where id = $1', [r?.rows?.[0]?.patient_id])
check('patient has the birth year', r.rows[0]?.birth_year === 1988, JSON.stringify(r.rows))
await db.exec('reset role')
r = await db.query("select count(*)::int as n from pg_proc where proname = 'submit_booking_request'")
check("the website booking functions are the clinic's and, until slice 4's clean-up, the old one", r.rows[0].n === 2, JSON.stringify(r.rows))

// --- Patient voice notes (website) ----------------------------------------------------------------
await setNow(at(WED, '10:00'))
await as('anon')
r = await expectOk('visitor sends a request (voice test)', submitG, ['Voice Check', '9444455555', null, null, null, 'Tooth pain', null, at('2026-10-24', '10:30'), 'female'])
const reqV = r?.rows?.[0]?.id
r = await db.query(`select public.voice_note_allowed('${reqV}.webm') as ok`)
check('a fresh request may attach a voice note', r.rows[0].ok === true)
await expectErr('a file named after another request is refused', `select public.set_request_voice('${reqV}'::uuid, 'page', '00000000-0000-0000-0000-000000000000.webm')`, [], /Invalid voice note/)
await expectErr('a note that never uploaded is refused', `select public.set_request_voice('${reqV}'::uuid, 'page', '${reqV}.webm')`, [], /did not upload/)
await db.exec('reset role')
await db.query(`insert into storage.objects (bucket_id, name) values ('request-voice', '${reqV}.webm')`)
await as('anon')
await expectOk('the visitor records the page version with its note', `select public.set_request_voice('${reqV}'::uuid, 'page', '${reqV}.webm')`)
r = await db.query(`select public.voice_note_allowed('${reqV}.webm') as ok`)
check('one note per request', r.rows[0].ok === false)
await expectOk('a second call changes nothing', `select public.set_request_voice('${reqV}'::uuid, 'whatsapp', null)`)
await as('authenticated', A)
r = await db.query('select voice_variant, voice_note from public.booking_requests where id = $1', [reqV])
check('the request keeps the page version and its note', r.rows[0]?.voice_variant === 'page' && r.rows[0]?.voice_note === `${reqV}.webm`, JSON.stringify(r.rows))
await as('anon')
r = await expectOk('another visitor sends a request (WhatsApp version)', submitG, ['Voice Two', '9444455556', null, null, null, null, null, at('2026-10-24', '11:00'), 'male'])
const reqW = r?.rows?.[0]?.id
await setNow(at(WED, '10:20'))
r = await db.query(`select public.voice_note_allowed('${reqW}.webm') as ok`)
check('after 15 minutes no note can be attached', r.rows[0].ok === false)
await expectOk('setting the version late changes nothing', `select public.set_request_voice('${reqW}'::uuid, 'whatsapp', null)`)
await as('authenticated', A)
r = await db.query('select voice_variant from public.booking_requests where id = $1', [reqW])
check('a late call leaves the request untouched', r.rows[0]?.voice_variant === null, JSON.stringify(r.rows))
await setNow(at(WED, '10:00'))

// --- Appointment lengths (Clinic OS) ---------------------------------------------------------------
await db.exec('reset role')
const startOk = async (iso, minutes) => (await db.query(`select public.is_clinic_start('${iso}'::timestamptz, ${minutes}) as ok`)).rows[0].ok
check('9:00 AM is a start for 30 minutes', await startOk(at(THU, '09:00'), 30))
check('12:30 PM fits 30 minutes (ends at closing, 1:00)', await startOk(at(THU, '12:30'), 30))
check('12:30 PM does not fit 1 hour (runs into lunch)', !(await startOk(at(THU, '12:30'), 60)))
check('11:30 AM does not fit 2 hours', !(await startOk(at(THU, '11:30'), 120)))
check('5:30 PM fits 2 hours (ends 7:30)', await startOk(at(THU, '17:30'), 120))
check('7:00 PM fits 30 minutes, not 1 hour', (await startOk(at(THU, '19:00'), 30)) && !(await startOk(at(THU, '19:00'), 60)))
check('any 5-minute mark is a start (9:45 AM for 45 minutes)', await startOk(at(THU, '09:45'), 45))
check('9:47 AM is not a 5-minute mark', !(await startOk(at(THU, '09:47'), 30)))
check('8:25 AM is before opening', !(await startOk(at(THU, '08:25'), 30)))
check('a length in 5-minute steps: 45 yes, 47 no', (await startOk(at(THU, '08:30'), 45)) && !(await startOk(at(THU, '08:30'), 47)))
check('lengths run from 10 minutes to 4 hours', !(await startOk(at(THU, '14:30'), 5)) && (await startOk(at(THU, '14:30'), 10))
  && (await startOk(at(THU, '14:30'), 240)) && !(await startOk(at(THU, '14:30'), 245)))
check('Fridays have no starts', !(await startOk(at(FRI, '09:00'), 30)))
await as('authenticated', A)
r = await expectOk('a request can be confirmed for 90 minutes', `select * from public.confirm_booking_request('${reqW}'::uuid, '${at('2026-10-24', '14:30')}'::timestamptz, null, 90)`)
r = await db.query('select duration_min from public.appointments where id = $1', [r?.rows?.[0]?.appointment_id])
check('the appointment is 90 minutes long', r.rows[0]?.duration_min === 90, JSON.stringify(r.rows))
await expectErr('confirming onto a length that runs into lunch is refused', `select * from public.confirm_booking_request('${reqV}'::uuid, '${at('2026-10-24', '12:30')}'::timestamptz, null, 90)`, [], /clinic time blocks/)

// --- Pause online booking -------------------------------------------------------------------------
await setNow(at(WED, '10:00'))
const pausedNow = async () => { await as('anon'); return (await db.query('select public.booking_paused_until()::text as until')).rows[0].until }
check('online booking starts open', (await pausedNow()) === null)
const openSlots = await slotsAs('anon')
check('the website has free times while open', openSlots.length > 0, String(openSlots.length))
await as('authenticated', B)
// Each clinic's members pause their own (slice 4): another clinic's login pauses only its own
await expectOk("another clinic's login pauses its own online booking", "select public.set_booking_pause('infinity')")
check("…and Smile Dental Clinic's stays open", (await pausedNow()) === null)
await as('authenticated', B)
await expectOk('…and opens its own again', 'select public.set_booking_pause(null)')
await as('anon')
await expectErr('a visitor cannot pause online booking', "select public.set_booking_pause('infinity')", [], /permission denied/)
await as('authenticated', A)
await expectOk('the owner pauses until he turns it back on', "select public.set_booking_pause('infinity')")
const until = await pausedNow()
check('paused shows as infinity', until === 'infinity', String(until))
check('no free times on the website while paused', (await slotsAs('anon')).length === 0)
await as('anon')
await expectErr('a request is refused while paused', submit, ['Paused Visitor', '9000000099', null, null, null, 'Check-up', null, openSlots[0]], /paused right now/)
await as('authenticated', A)
await expectOk('the owner turns online booking back on', 'select public.set_booking_pause(null)')
check('open again', (await pausedNow()) === null)
check('free times are back', (await slotsAs('anon')).length === openSlots.length)
await as('authenticated', A)
await expectOk('a pause for the rest of today', "select public.set_booking_pause('" + at(THU, '00:00') + "'::timestamptz)")
check('paused until midnight', (await pausedNow()) !== null)
await setNow(at(THU, '00:01'))
check('the pause ends by itself at midnight', (await pausedNow()) === null)
check('free times come back by themselves', (await slotsAs('anon')).length > 0)
await setNow(at(WED, '10:00'))
await as('authenticated', A)
await expectOk('clean up the pause', 'select public.set_booking_pause(null)')

await as('postgres')
console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
