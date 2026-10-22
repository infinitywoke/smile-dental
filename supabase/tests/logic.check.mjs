// Checks the logic-audit rules of supabase/schema.sql in a throwaway Postgres (PGlite): money stays
// with its visit, "WhatsApp sent" goes stale when the bill changes, one visit a day, no booking into
// blocked time or the past, Confirm keeps the medical alert, and deleting a patient or resetting
// everything still works. See docs/build/review-logic.md (sections 3 and 4).
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder
// and run it from there (copy this file next to node_modules): node logic.check.mjs <path to this repo>
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
const at = (date, hhmm) => `${date}T${hhmm}:00+05:30`
// Wednesday 14 Oct 2026; Tuesday 13, Thursday 15, Friday 16, Saturday 17
const TUE = '2026-10-13', WED = '2026-10-14', THU = '2026-10-15', FRI = '2026-10-16', SAT = '2026-10-17'

// A fresh database from schema.sql (run twice: safe to repeat), with the migration on top (safe to
// run on a database that already has it). Signed in as the doctor, so row-level security applies.
async function freshDb() {
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
    insert into auth.users values ('${A}', 'smiledental8925@gmail.com');
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `)
  await db.exec(read('schema.sql'))
  await db.exec(read('schema.sql'))
  const h = {
    db,
    async doctor() { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${A}', false); set role authenticated;`) },
    async admin() { await db.exec('reset role') },
    async q(sql, params) { return (await db.query(sql, params)).rows },
    async one(sql, params) { return (await db.query(sql, params)).rows[0] },
    async setNow(iso) {
      await db.exec('reset role')
      await db.exec(`create or replace function public.clinic_now() returns timestamptz language sql stable as $$ select '${iso}'::timestamptz $$;`)
    },
    // The error message, or null when the statement worked
    async err(sql, params) {
      try { await db.query(sql, params); return null } catch (e) { return e.message }
    },
  }
  await h.setNow(at(WED, '10:00'))
  await h.doctor()
  const p = (await h.one(`insert into public.patients (name, phone, medical_alerts) values ('Prakash Shetty', '9845021763', 'Diabetic') returning id`)).id
  return { h, p }
}

let h, p
try {
  ({ h, p } = await freshDb())
  ok('schema.sql applies twice, and the migration applies on top of it')
} catch (e) {
  bad('apply schema.sql (twice)', e)
  console.log(`\n${passes} passed, ${failures} failed`)
  process.exit(1)
}

// --- 1. Money belongs to a visit; a visit holding money can't be deleted ---------------------
{
  const v = (await h.one(`insert into public.visits (patient_id) values ($1) returning id`, [p])).id
  await h.q(`insert into public.visit_charges (visit_id, patient_id, description, amount) values ($1, $2, 'RCT', 3500)`, [v, p])
  await h.q(`insert into public.payments (visit_id, patient_id, amount, method) values ($1, $2, 1500, 'cash')`, [v, p])
  const asDoctor = await h.err(`insert into public.payments (visit_id, patient_id, amount, method) values (null, $1, 10, 'cash')`, [p])
  check('the doctor cannot save a payment without a visit', asDoctor !== null, 'allowed')
  await h.admin()
  const asAdmin = await h.err(`insert into public.payments (owner_id, visit_id, patient_id, amount, method) values ($2, null, $1, 10, 'cash')`, [p, A])
  check('no one can save a payment without a visit (not null)', /null value in column "visit_id"/.test(asAdmin ?? ''), asAdmin ?? 'allowed')
  await h.doctor()
  const del = await h.err(`delete from public.visits where id = $1`, [v])
  check('a visit holding a payment cannot be deleted', /payments_visit_id_fkey/.test(del ?? ''), del ?? 'allowed')
  const kept = await h.one(`select count(*)::int n from public.payments where visit_id = $1`, [v])
  check('the refused delete kept the payment', kept.n === 1)
  await h.q(`delete from public.payments where visit_id = $1`, [v])
  check('after its payment is removed, the visit can be deleted (charges go with it)', (await h.err(`delete from public.visits where id = $1`, [v])) === null)
  const left = await h.one(`select count(*)::int n from public.visit_charges where visit_id = $1`, [v])
  check('its charges went with it', left.n === 0)
}

// --- 2. resend_needed: "WhatsApp sent" goes stale when the bill changes --------------------
{
  const v = (await h.one(`insert into public.visits (patient_id, visit_date) values ($1, '2026-10-01') returning id`, [p])).id
  await h.q(`insert into public.visit_charges (visit_id, patient_id, description, amount) values ($1, $2, 'Filling', 1200)`, [v, p])
  const pay = (await h.one(`insert into public.payments (visit_id, patient_id, amount, method) values ($1, $2, 1200, 'upi') returning id`, [v, p])).id
  check('a visit not sent yet never needs a resend', (await h.one(`select resend_needed r from public.visits where id = $1`, [v])).r === false)
  await h.q(`update public.visits set closed_at = now(), resend_needed = false where id = $1`, [v]) // markWhatsappSent
  await h.q(`delete from public.payments where id = $1`, [pay])
  check('removing a payment after the send sets resend_needed', (await h.one(`select resend_needed r from public.visits where id = $1`, [v])).r === true)
  await h.q(`update public.visits set resend_needed = false where id = $1`, [v]) // Send again
  await h.q(`insert into public.visit_charges (visit_id, patient_id, description, amount) values ($1, $2, 'X-ray', 350)`, [v, p])
  check('adding a charge after the send sets resend_needed', (await h.one(`select resend_needed r from public.visits where id = $1`, [v])).r === true)
  const money = await h.one(`select charged, paid from public.visit_money where visit_id = $1`, [v])
  check('visit_money sums the visit (₹1,550 charged, ₹0 paid)', money?.charged === '1550.00' && money?.paid === '0.00', JSON.stringify(money))
}

// --- 3. One visit per patient per day -----------------------------------------------------------
{
  await h.q(`insert into public.visits (patient_id, visit_date) values ($1, $2)`, [p, WED])
  const second = await h.err(`insert into public.visits (patient_id, visit_date) values ($1, $2)`, [p, WED])
  check('a second visit the same day is refused', /visits_one_per_patient_day/.test(second ?? ''), second ?? 'allowed')
  check('a visit the next day is fine', (await h.err(`insert into public.visits (patient_id, visit_date) values ($1, $2)`, [p, THU])) === null)
}

// --- 4. No booking into blocked time or the past; Send and Cancel still work on past rows ----
const book = (start) => h.err(`insert into public.appointments (patient_id, starts_at, duration_min, status) values ($1, $2, 40, 'booked')`, [p, start])
let appt
{
  appt = (await h.one(`insert into public.appointments (patient_id, starts_at, duration_min, status) values ($1, $2, 40, 'booked') returning id`, [p, at(WED, '10:30')])).id
  await h.q(`insert into public.time_off (starts_at, ends_at, note) values ($1, $2, 'Closed')`, [at(THU, '00:00'), at(FRI, '00:00')])
  check('booking into a closed day is refused', (await book(at(THU, '11:50'))) === 'That time is blocked off in your calendar.')
  const move = await h.err(`update public.appointments set starts_at = $1 where id = $2`, [at(THU, '14:30'), appt])
  check('moving into a closed day is refused', move === 'That time is blocked off in your calendar.', move ?? 'allowed')
  check('booking yesterday is refused', (await book(at(TUE, '10:30'))) === 'That time has already passed.')
  check('booking the block in progress is allowed', (await book(at(WED, '09:50'))) === null)
  await h.setNow(at(WED, '19:00'))
  await h.doctor()
  check('a past appointment can still be marked done (Send)', (await h.err(`update public.appointments set status = 'done' where id = $1`, [appt])) === null)
  check('and put back to booked (Delete visit)', (await h.err(`update public.appointments set status = 'booked' where id = $1`, [appt])) === null)
  check('and cancelled', (await h.err(`update public.appointments set status = 'cancelled' where id = $1`, [appt])) === null)
  await h.setNow(at(WED, '10:00'))
  await h.doctor()
}

// --- Reopening one block inside a closed day keeps the day closed (unblockTime) -----------------
{
  await h.q(`insert into public.time_off (starts_at, ends_at, note) values ($1, $2, 'Blocked')`, [at(SAT, '16:30'), at(SAT, '17:10')])
  await h.q(`insert into public.time_off (starts_at, ends_at, note) values ($1, $2, 'Closed')`, [at(SAT, '00:00'), at('2026-10-18', '00:00')])
  // What unblockTime deletes for the 4:30 PM block: time off lying inside that block only
  const gone = await h.q(`delete from public.time_off where starts_at >= $1 and ends_at <= $2 returning note`, [at(SAT, '16:30'), at(SAT, '17:10')])
  check('reopening 4:30 PM removes only its own block', gone.length === 1 && gone[0].note === 'Blocked', JSON.stringify(gone))
  await h.admin() // the website's view (app_config points at the doctor)
  const offered = await h.q(`select slot_start from public.get_open_slots($1::date, 1)`, [SAT])
  check('the closed day still offers nothing on the website', offered.length === 0, `${offered.length} offered`)
  await h.doctor()
  // What reopenDay deletes: time off covering the whole day
  const day = await h.q(`delete from public.time_off where starts_at <= $1 and ends_at >= $2 returning note`, [at(SAT, '00:00'), at('2026-10-18', '00:00')])
  await h.admin()
  const after = await h.q(`select slot_start from public.get_open_slots($1::date, 1)`, [SAT])
  check('"Reopen the day" opens it again', day.length === 1 && after.length === 18, `${day.length} removed, ${after.length} offered`)
  await h.doctor()
}

// --- 5. Confirm: a block that is over is refused; the medical alert typed on the website is kept --
{
  await h.admin()
  const late = (await h.one(`insert into public.booking_requests (owner_id, name, phone, requested_start, status, created_at) values ($1, 'Late', '9876543210', $2, 'new', $3) returning id`, [A, at(WED, '10:30'), at(WED, '07:00')])).id
  const known = (await h.one(`insert into public.booking_requests (owner_id, name, phone, medical_alerts, requested_start, status, created_at) values ($1, 'Prakash', '9845021763', 'Now on blood thinners', $2, 'new', $3) returning id`, [A, at(SAT, '10:30'), at(WED, '09:00')])).id
  const again = (await h.one(`insert into public.booking_requests (owner_id, name, phone, medical_alerts, requested_start, status, created_at) values ($1, 'Prakash Shetty', '9845021763', 'now on blood thinners', $2, 'new', $3) returning id`, [A, at(SAT, '11:10'), at(WED, '09:30')])).id
  await h.setNow(at(WED, '15:00'))
  await h.doctor()
  const past = await h.err(`select * from public.confirm_booking_request($1, $2::timestamptz, null)`, [late, at(WED, '10:30')])
  check('Confirm at 3 PM for 10:30 AM the same day is refused', past === 'That time has already passed.', past ?? 'allowed')
  const linked = await h.err(`select * from public.confirm_booking_request($1, $2::timestamptz, $3)`, [known, at(SAT, '10:30'), p])
  check('Confirm linked to the known patient works', linked === null, linked)
  let alerts = (await h.one(`select medical_alerts m from public.patients where id = $1`, [p])).m
  check('the website alert is added to the record, dated', alerts === 'Diabetic\nNow on blood thinners (website, 14 Oct 2026)', JSON.stringify(alerts))
  await h.err(`select * from public.confirm_booking_request($1, $2::timestamptz, $3)`, [again, at(SAT, '11:10'), p])
  alerts = (await h.one(`select medical_alerts m from public.patients where id = $1`, [p])).m
  check('the same alert is not added twice', alerts === 'Diabetic\nNow on blood thinners (website, 14 Oct 2026)', JSON.stringify(alerts))
  const retry = await h.err(`select * from public.confirm_booking_request($1, $2::timestamptz, $3)`, [known, at(SAT, '10:30'), p])
  check('a second Confirm says the request was handled (the app then re-sends its confirmation)', retry === 'This request has already been handled.', retry ?? 'allowed')
  const req = await h.one(`select status, patient_id, appointment_id from public.booking_requests where id = $1`, [known])
  check('the booked request points at its patient and appointment', req.status === 'booked' && req.patient_id === p && !!req.appointment_id, JSON.stringify(req))
  const patients = await h.one(`select count(*)::int n from public.patients where phone = '9845021763'`)
  check('no second patient was made for the known phone', patients.n === 1, String(patients.n))
  await h.setNow(at(WED, '10:00'))
  await h.doctor()
}

// --- The day strip counts only booked appointments without a visit (getBusyCounts) --------------
{
  const q = (await h.one(`insert into public.patients (name) values ('No Phone') returning id`)).id
  const qv = (await h.one(`insert into public.visits (patient_id, visit_date) values ($1, $2) returning id`, [q, '2026-10-19'])).id
  await h.q(`insert into public.appointments (patient_id, starts_at, duration_min, status, visit_id) values ($1, $2, 40, 'booked', $3)`, [q, at('2026-10-19', '10:30'), qv])
  await h.q(`insert into public.appointments (patient_id, starts_at, duration_min, status) values ($1, $2, 40, 'booked')`, [p, at('2026-10-19', '11:10')])
  const n = await h.one(`select count(*)::int n from public.appointments where status = 'booked' and visit_id is null and starts_at >= $1 and starts_at < $2`, [at('2026-10-19', '00:00'), at('2026-10-20', '00:00')])
  check('one of two booked appointments counts (the other has its visit)', n.n === 1, String(n.n))
}

// --- Deleting a patient, and resetting everything, still work --------------------------------------
{
  for (const date of ['2026-10-05', '2026-10-08']) {
    const v = (await h.one(`insert into public.visits (patient_id, visit_date) values ($1, $2) returning id`, [p, date])).id
    await h.q(`insert into public.visit_charges (visit_id, patient_id, description, amount) values ($1, $2, 'X', 700)`, [v, p])
    await h.q(`insert into public.payments (visit_id, patient_id, amount, method) values ($1, $2, 300, 'cash')`, [v, p])
    await h.q(`insert into public.visit_photos (visit_id, storage_path) values ($1, $2)`, [v, `${A}/${v}/a.jpg`])
    await h.q(`update public.visits set closed_at = now() where id = $1`, [v])
  }
  const del = await h.err(`delete from public.patients where id = $1`, [p])
  check('deleting a patient with sent visits, payments, photos and appointments works', del === null, del)
  const left = await h.one(`select (select count(*) from public.visits where patient_id = $1)::int v, (select count(*) from public.payments where patient_id = $1)::int pay, (select count(*) from public.appointments where patient_id = $1)::int ap`, [p])
  check('and removes everything of theirs', left.v === 0 && left.pay === 0 && left.ap === 0, JSON.stringify(left))
  const r = (await h.one(`insert into public.patients (name) values ('Reset Me') returning id`)).id
  const rv = (await h.one(`insert into public.visits (patient_id) values ($1) returning id`, [r])).id
  await h.q(`insert into public.payments (visit_id, patient_id, amount, method) values ($1, $2, 10, 'upi')`, [rv, r])
  await h.admin()
  let reset = null
  try { await h.db.exec(read('reset-all-data.sql')) } catch (e) { reset = e.message }
  check('reset-all-data.sql still empties everything', reset === null, reset)
  const total = await h.one(`select (select count(*) from public.patients)::int + (select count(*) from public.payments)::int n`)
  check('nothing left after the reset', total.n === 0, String(total.n))
}

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
