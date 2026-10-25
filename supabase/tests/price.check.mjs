// Checks the clinic's price list in the database (supabase/price-list-2026-10.sql) in a throwaway Postgres
// (PGlite): the schema with it applies twice, and the change file twice on top; replace_price_list swaps a
// doctor's whole list at once, or nothing when a line is wrong; each doctor touches only their own list;
// anyone (the website) reads the clinic's list, and only the clinic's, in its order.
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder and run
// it from there (copy this file next to node_modules): node price.check.mjs <path to this repo>
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
`)
const as = async (who) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false); set role ${who ? 'authenticated' : 'anon'};`)
const rows = async (sql) => (await db.query(sql)).rows
const err = async (sql) => { try { await db.query(sql); return null } catch (e) { return e.message } }
const list = (items) => `select public.replace_price_list('${JSON.stringify(items).replace(/'/g, "''")}'::jsonb) as n`

try {
  await db.exec(read('schema.sql'))
  await db.exec(read('schema.sql'))
  await db.exec(read('price-list-2026-10.sql'))
  await db.exec(read('price-list-2026-10.sql'))
  ok('schema.sql applies twice, and the change file twice on top of it')
} catch (e) {
  bad('apply schema.sql and the change file', e)
}
// The clinic is doctor A
await db.exec(`delete from public.app_config; insert into public.app_config (clinic_owner_id) values ('${A}')`)

const two = [
  { slug: 'consultation', treatment: 'Consultation', description: 'An examination.', detail: 'Standard Consultation', cost: '200/-' },
  { slug: 'x-ray', treatment: 'X-Ray', detail: 'Standard X-Ray', cost: "350/-" },
]
await as(A)
check('the doctor replaces the list: two lines', (await rows(list(two)))[0]?.n === 2)
check('then three, the old ones gone', (await rows(list([...two, { slug: 'fillings', treatment: 'Fillings', detail: 'GIC', cost: '700/-' }])))[0]?.n === 3 &&
  (await rows(`select count(*)::int as n from public.price_list`))[0].n === 3)
check('a wrong line refuses the whole sheet and keeps the old list',
  (await err(list([two[0], { slug: 'Bad Slug!', treatment: 'X', detail: '', cost: '1/-' }]))) !== null &&
  (await rows(`select count(*)::int as n from public.price_list`))[0].n === 3)
check('an empty list is refused', (await err(list([]))) !== null)
check('the same treatment and option twice is refused', (await err(list([two[0], two[0]]))) !== null)

await as(B)
await rows(list([{ slug: 'other', treatment: 'Other clinic', detail: '', cost: '1/-' }]))
check("another doctor's list leaves the clinic's alone", (await rows(`select count(*)::int as n from public.price_list`))[0].n === 1)

await as('')
const shown = await rows(`select line_no, slug, treatment, description, detail, cost from public.public_price_list()`)
check("anyone reads the clinic's list, in order, and only the clinic's",
  shown.length === 3 && shown[0].slug === 'consultation' && shown[0].description === 'An examination.' && shown[2].treatment === 'Fillings' && !shown.some((r) => r.treatment === 'Other clinic'),
  JSON.stringify(shown))
check('the website cannot read or change the table itself', (await err(`select * from public.price_list`)) !== null)
check('nor replace the list', (await err(list(two))) !== null)

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
