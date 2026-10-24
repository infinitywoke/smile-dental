// Checks supabase/discounts-2026-10.sql in a throwaway Postgres (PGlite): a discount is a bill line below
// zero, only of its own kind; every other line stays at zero or more; the visit's money takes the
// discount off; a discount after the WhatsApp went marks the bill changed; another login can't add one.
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder and run
// it from there (copy this file next to node_modules): node discount.check.mjs <path to this repo>
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
const rows = async (sql) => (await db.query(sql)).rows
const err = async (sql) => { try { await db.query(sql); return null } catch (e) { return e.message } }

try {
  await db.exec(read('schema.sql'))
  await db.exec(read('schema.sql'))
  await db.exec(read('discounts-2026-10.sql'))
  await db.exec(read('discounts-2026-10.sql'))
  ok('schema.sql applies twice, and the change file twice on top of it')
} catch (e) {
  bad('apply schema.sql and the change file', e)
}

await as(A)
const patient = (await rows(`insert into public.patients (name) values ('Asha Rao') returning id`))[0].id
const visit = (await rows(`insert into public.visits (patient_id, visit_date) values ('${patient}', '2026-10-12') returning id`))[0].id
const line = (kind, amount, description = 'Line') =>
  `insert into public.visit_charges (visit_id, patient_id, description, amount, kind) values ('${visit}', '${patient}', '${description}', ${amount}, '${kind}')`
await db.exec(line('item', 1000, 'Root canal treatment'))
await db.exec(line('discount', -200, 'Discount (Senior citizen)'))
ok('a discount is saved as a line below zero')
check('a discount above zero is refused', (await err(line('discount', 200))) !== null)
check('a discount of nothing is refused', (await err(line('discount', 0))) !== null)
check('any other line below zero is refused', (await err(line('extra', -50))) !== null && (await err(line('item', -50))) !== null)
check('a kind the bill does not know is refused', (await err(line('refund', -50))) !== null)
const money = (await rows(`select charged::float as charged from public.visit_money where visit_id = '${visit}'`))[0]
check("the visit's money takes the discount off", money?.charged === 800, JSON.stringify(money))

// After the WhatsApp: a discount added is a changed bill
await db.exec(`update public.visits set closed_at = now(), resend_needed = false where id = '${visit}'`)
await db.exec(line('discount', -100, 'Discount'))
const changed = (await rows(`select resend_needed from public.visits where id = '${visit}'`))[0]
check('a discount after the WhatsApp went marks the bill changed', changed?.resend_needed === true, JSON.stringify(changed))

await as(B)
check('another login cannot add a discount to his visit', (await err(line('discount', -100))) !== null)

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
