// Checks the stock and costs part of supabase/schema.sql in a throwaway Postgres (PGlite): who may see and
// change what, materials taken off stock by a charge and put back when it goes, regular bills paid once a
// month, and low stock in the morning brief.
// Needs @electric-sql/pglite (not a project dependency): run from a scratch folder that has it,
// with this file copied next to node_modules: node stock.check.mjs <path to this repo>
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
const SECRET = 'b'.repeat(64)

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
const onHand = async (item) => Number((await db.query('select on_hand from public.stock_levels where item_id = $1', [item])).rows[0]?.on_hand)

// --- Stock: in, on hand, and who may see it ---------------------------------------------------------
await as('authenticated', A)
const item = (await db.query(`insert into public.stock_items (name, unit, low_level, supplier) values ('Composite A2', 'capsule', 3, 'Dental Mart') returning id`)).rows[0].id
await db.query(`insert into public.stock_moves (item_id, kind, qty, unit_cost, expires_on) values ($1, 'in', 10, 120, '2027-06-30')`, [item])
check('a bill in of 10 capsules: 10 on hand', (await onHand(item)) === 10)
check('the soonest expiry shows', String((await db.query('select next_expiry from public.stock_levels where item_id = $1', [item])).rows[0].next_expiry).startsWith('2027-06-30') || new Date((await db.query('select next_expiry from public.stock_levels where item_id = $1', [item])).rows[0].next_expiry).getFullYear() === 2027)
await expectErr('a use must take stock away, not add it', `insert into public.stock_moves (item_id, kind, qty) values ($1, 'use', 2)`, [item], /check constraint/)
await expectErr('the same item name twice is refused', `insert into public.stock_items (name) values ('composite a2')`, [], /duplicate key|unique/)

await as('authenticated', B)
check('another account sees none of the stock', (await db.query('select * from public.stock_levels')).rows.length === 0)
await expectErr('another account cannot add a move to this item', `insert into public.stock_moves (item_id, kind, qty) values ($1, 'in', 5)`, [item], /row-level security/)
await as('anon')
await expectErr('the public cannot read stock', 'select * from public.stock_items', [], /permission denied/)
await expectErr('the public cannot read costs', 'select * from public.costs', [], /permission denied/)

// --- Materials per treatment: a charge takes them off; removing it puts them back -------------------
await as('authenticated', A)
await db.query(`insert into public.treatment_materials (treatment_slug, charge_description, item_id, qty) values ('fillings', 'Fillings – 3M Z350 Composite', $1, 1)`, [item])
const patient = (await db.query(`insert into public.patients (name, phone) values ('Stock patient', '9000000003') returning id`)).rows[0].id
const visit = (await db.query(`insert into public.visits (patient_id) values ($1) returning id`, [patient])).rows[0].id
const charge = (await db.query(`insert into public.visit_charges (visit_id, patient_id, description, amount, kind, treatment_slug)
  values ($1, $2, 'Fillings – 3M Z350 Composite', 1200, 'item', 'fillings') returning id`, [visit, patient])).rows[0].id
check('a Z350 filling takes one capsule off: 9 on hand', (await onHand(item)) === 9)
await db.query(`insert into public.visit_charges (visit_id, patient_id, description, amount, kind, treatment_slug)
  values ($1, $2, 'Fillings – 3M Ketac Molar GIC', 700, 'item', 'fillings')`, [visit, patient])
check('another filling material takes nothing set for Z350', (await onHand(item)) === 9)
await db.query('delete from public.visit_charges where id = $1', [charge])
check('removing the charge puts the capsule back: 10 on hand', (await onHand(item)) === 10)
await as('authenticated', B)
await expectErr('another account cannot set materials with this item', `insert into public.treatment_materials (treatment_slug, charge_description, item_id, qty) values ('fillings', 'x', $1, 1)`, [item], /row-level security/)

// --- Costs: a regular bill is paid once a month ------------------------------------------------------
await as('authenticated', A)
const rent = (await db.query(`insert into public.fixed_costs (name, category, amount) values ('Rent', 'rent', 15000) returning id`)).rows[0].id
await db.query(`insert into public.costs (spent_on, category, amount, fixed_cost_id) values ('2026-10-05', 'rent', 15000, $1)`, [rent])
await expectErr('the same month twice is refused', `insert into public.costs (spent_on, category, amount, fixed_cost_id) values ('2026-10-20', 'rent', 15000, $1)`, [rent], /duplicate key|unique/)
await db.query(`insert into public.costs (spent_on, category, amount, fixed_cost_id) values ('2026-11-05', 'rent', 15000, $1)`, [rent])
ok('the next month is fine')
await expectErr('a cost must be more than nothing', `insert into public.costs (category, amount) values ('repairs', 0)`, [], /check constraint/)

// --- Low stock in the morning brief ------------------------------------------------------------------
await db.query(`insert into public.stock_moves (item_id, kind, qty, note) values ($1, 'use', -8, 'used')`, [item])
const gloves = (await db.query(`insert into public.stock_items (name, unit, low_level) values ('Gloves M', 'box', 2) returning id`)).rows[0].id
await db.query(`insert into public.stock_moves (item_id, kind, qty) values ($1, 'in', 10)`, [gloves])
await setNow('2026-10-22T08:20:00+05:30')
await as('anon')
const due = (await db.query('select public.notify_due($1) as j', [SECRET])).rows[0].j
const brief = due?.items?.find((i) => i.kind === 'morning_brief')
check('the brief names what is low (2 of 3 composite), not what is fine', JSON.stringify(brief?.low) === '["Composite A2"]', JSON.stringify(brief))

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
