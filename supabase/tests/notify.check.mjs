// Checks the notification part of supabase/schema.sql in a throwaway Postgres (PGlite): who may read what,
// the secret, and that each notification is due at the right time and goes once.
// Needs @electric-sql/pglite (not a project dependency): run from a scratch folder that has it,
// with this file copied next to node_modules: node notify.check.mjs <path to this repo>
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync } from 'node:fs'

const repo = process.argv[2]
const db = new PGlite({ extensions: { btree_gist } })
let failures = 0
let passes = 0
const ok = (name) => { passes++; console.log('PASS', name) }
const bad = (name, e) => { failures++; console.log('FAIL', name, e?.message ?? e) }
const check = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail || 'condition false'))
async function expectErr(name, sql, params, re) {
  try { await db.query(sql, params); bad(name, 'expected an error') } catch (e) {
    if (re && !re.test(e.message)) bad(name, `wrong error: ${e.message}`); else ok(`${name} -> ${e.message}`)
  }
}

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const SECRET = 'a'.repeat(64)

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
  -- Supabase Vault, as far as these functions use it
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  insert into vault.decrypted_secrets values ('clinic_os_cron', '${SECRET}');
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  insert into auth.users values ('${A}', 'smiledental8925@gmail.com'), ('${B}', 'test@example.com');
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`)

for (let i = 1; i <= 2; i++) {
  try { await db.exec(readFileSync(`${repo}/supabase/schema.sql`, 'utf8')); ok(`apply schema.sql (run ${i}, safe to repeat)`) } catch (e) { bad(`apply schema.sql run ${i}`, e) }
}

const as = async (role, uid) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`)
}
const setNow = async (iso) => {
  await db.exec('reset role')
  await db.exec(`create or replace function public.clinic_now() returns timestamptz language sql stable as $$ select '${iso}'::timestamptz $$;`)
}
const at = (date, hhmm) => `${date}T${hhmm}:00+05:30`
const WED = '2026-10-14', THU = '2026-10-15', FRI = '2026-10-16'
const due = async () => { await as('anon'); return (await db.query('select public.notify_due($1) as j', [SECRET])).rows[0].j }
const kinds = (j) => (j?.items ?? []).map((i) => i.kind).join(',')

// --- Who may read and write what ----------------------------------------------------------
await as('authenticated', A)
await db.query(`insert into public.push_subscriptions (endpoint, p256dh, auth, device) values ('https://push.example/abc', 'key', 'secret', 'Android · Chrome')`)
ok('the doctor saves his phone')
await expectErr('he cannot save a phone for another account', `insert into public.push_subscriptions (owner_id, endpoint, p256dh, auth) values ('${B}', 'https://push.example/x', 'k', 'a')`, [], /row-level security/)
await expectErr('a web address that is not https is refused', `insert into public.push_subscriptions (endpoint, p256dh, auth) values ('http://push.example/y', 'k', 'a')`, [], /check constraint/)
await db.query(`insert into public.notification_settings (morning_brief) values (true)`)
ok('the doctor saves his settings')
await as('authenticated', B)
check('another account sees none of his phones', (await db.query('select * from public.push_subscriptions')).rows.length === 0)
await as('anon')
await expectErr('the public cannot read phones', 'select * from public.push_subscriptions', [], /permission denied/)
await expectErr('the public cannot read settings', 'select * from public.notification_settings', [], /permission denied/)
await expectErr('the public cannot read the log', 'select * from public.notification_log', [], /permission denied/)
await expectErr('the public cannot check secrets directly', `select public.notify_secret_ok('x')`, [], /permission denied/)
await expectErr('the public cannot read a target directly', `select public.notify_target('${A}')`, [], /permission denied/)
await expectErr('notify_due without the secret', 'select public.notify_due($1)', ['wrong'.repeat(10)], /Not allowed/)
await expectErr('notify_due with no secret', 'select public.notify_due(null)', [], /Not allowed/)

// --- A new website request: once ----------------------------------------------------------
await setNow(at(WED, '09:00'))
await as('anon')
const submit = `select public.submit_booking_request($1, $2, $3, $4, $5, $6, $7, $8::timestamptz) as id`
const requestId = (await db.query(submit, ['Asha Rao', '9876543210', null, null, null, null, null, at(THU, '10:30')])).rows[0].id
await db.exec('reset role')
await db.query(`update public.booking_requests set reason = 'Toothache', created_at = $1 where id = $2`, [at(WED, '09:00'), requestId])
await as('anon')
await expectErr('notify_new_request without the secret', 'select public.notify_new_request($1, $2)', ['x'.repeat(40), requestId], /Not allowed/)
const first = (await db.query('select public.notify_new_request($1, $2) as j', [SECRET, requestId])).rows[0].j
check('a new request is sent with what it is for and when', first?.items?.[0]?.kind === 'new_request' && first.items[0].reason === 'Toothache' && first.items[0].name === 'Asha Rao', JSON.stringify(first))
check('it goes to his phone', first?.subscriptions?.length === 1 && first.subscriptions[0].endpoint === 'https://push.example/abc')
check('names stay off the lock screen by default', first?.settings?.show_names === false && first.settings.quiet_from === '21:00')
check('the same request is not sent twice', (await db.query('select public.notify_new_request($1, $2) as j', [SECRET, requestId])).rows[0].j === null)

// --- Still waiting after 30 minutes: once, unless it has arrived on WhatsApp --------------------
await setNow(at(WED, '09:20'))
check('20 minutes after: nothing due yet', kinds(await due()) === 'morning_brief', 'the brief is due from 8:15, the request not yet')
await setNow(at(WED, '09:31'))
let j = await due()
check('31 minutes after: the request is still waiting', kinds(j) === 'waiting_request' && j.items[0].ref === requestId, JSON.stringify(j))
check('and only once', (await due()) === null)

await setNow(at(WED, '09:00'))
await as('anon')
const second = (await db.query(submit, ['Prakash', '9845021763', null, null, null, null, null, at(THU, '11:10')])).rows[0].id
await db.exec('reset role')
await db.query(`update public.booking_requests set created_at = $1, received_at = $2 where id = $3`, [at(WED, '09:05'), at(WED, '09:10'), second])
await setNow(at(WED, '10:00'))
check('a request that arrived on WhatsApp is not chased', (await due()) === null)

// --- The morning brief: from 8:15, once a day, not on Fridays or a blocked-off morning ------------
await db.exec('reset role')
const patient = (await db.query(`insert into public.patients (owner_id, name, phone) values ('${A}', 'Brief patient', '9000000002') returning id`)).rows[0].id
await db.query(`insert into public.appointments (owner_id, patient_id, starts_at, duration_min) values ('${A}', $1, $2, 40), ('${A}', $1, $3, 40)`,
  [patient, at(THU, '09:10'), at(THU, '16:30')])
await setNow(at(THU, '08:10'))
check('8:10 AM: no brief yet', (await due()) === null)
await setNow(at(THU, '08:16'))
j = await due()
const brief = j?.items?.find((i) => i.kind === 'morning_brief')
// Both requests are still waiting for him: one not yet on WhatsApp, one received but not confirmed
check('8:16 AM: the brief, with 2 booked from 9:10 AM and 2 requests waiting', brief?.booked === 2 && new Date(brief.first_at).toISOString() === new Date(at(THU, '09:10')).toISOString() && brief.waiting === 2, JSON.stringify(brief))
check('the brief goes once a day', (await due()) === null)
await setNow(at(FRI, '08:30'))
check('no brief on a Friday', (await due()) === null)
await db.exec('reset role')
await db.query(`insert into public.time_off (owner_id, starts_at, ends_at) values ('${A}', $1, $2)`, ['2026-10-17T08:00:00+05:30', '2026-10-17T19:30:00+05:30'])
await setNow('2026-10-17T08:30:00+05:30')
check('no brief on a day blocked off', (await due()) === null)
await setNow('2026-10-18T13:00:00+05:30')
check('no brief after noon if it was missed', (await due()) === null)

// --- Phones the push service says are gone -------------------------------------------------
await as('anon')
await expectErr('notify_gone without the secret', 'select public.notify_gone($1, $2)', ['y'.repeat(40), ['https://push.example/abc']], /Not allowed/)
check('a gone phone is forgotten', (await db.query('select public.notify_gone($1, $2) as n', [SECRET, ['https://push.example/abc']])).rows[0].n === 1)

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
