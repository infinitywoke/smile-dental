// Checks each patient's Tally ledger (supabase/tally-patient-ledgers-2026-10.sql) in a throwaway Postgres
// (PGlite): the schema with it applies twice; the change file applies twice on top of the schema as it was
// before (tally settings with the income ledger required); a ledger name saves; a blank one is refused; the
// income ledger may then be empty.
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder and run
// it from there (copy this file next to node_modules): node tally.check.mjs <path to this repo>
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync } from 'node:fs'

const repo = process.argv[2]
const read = (f) => readFileSync(`${repo}/supabase/${f}`, 'utf8')

let failures = 0
let passes = 0
const ok = (name) => { passes++; console.log('PASS', name) }
const bad = (name, e) => { failures++; console.log('FAIL', name, e?.message ?? e) }

const A = '11111111-1111-1111-1111-111111111111'
const start = async () => {
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
    insert into auth.users values ('${A}', 'doctor@example.com');
  `)
  return db
}

const db = await start()
try {
  await db.exec(read('schema.sql'))
  await db.exec(read('schema.sql'))
  await db.exec(read('tally-patient-ledgers-2026-10.sql'))
  await db.exec(read('tally-patient-ledgers-2026-10.sql'))
  ok('schema.sql applies twice, and the change file twice on top of it')
} catch (e) {
  bad('apply schema.sql and the change file', e)
}

// The live database as it was: income ledger required, no ledger columns on patients
const old = await start()
try {
  const before = read('schema.sql')
    .replace(/^.*tally_ledger.*\n/gm, '')
    .replace('income_ledger text check (char_length(income_ledger) between 1 and 100), -- only for one entry per day',
      'income_ledger text not null check (char_length(income_ledger) between 1 and 100),')
    .replace(/^alter table public\.tally_settings alter column income_ledger drop not null;\n/m, '')
  await old.exec(before)
  await old.exec(`insert into public.tally_settings (owner_id, cash_ledger, bank_ledger, income_ledger) values ('${A}', 'Cash', 'Savings A/C', 'Shin')`)
  await old.exec(read('tally-patient-ledgers-2026-10.sql'))
  await old.exec(read('tally-patient-ledgers-2026-10.sql'))
  const { rows } = await old.query(`select income_ledger from public.tally_settings`)
  if (rows[0]?.income_ledger === 'Shin') ok('on the schema as it was, the change file applies twice and keeps saved settings')
  else bad('the change file keeps saved settings', JSON.stringify(rows))
  await old.exec(`update public.tally_settings set income_ledger = null`)
  ok('the income ledger may then be empty')
} catch (e) {
  bad('the change file on the schema as it was', e)
}

try {
  await db.exec(`insert into public.patients (owner_id, name, tally_ledger) values ('${A}', 'Asha Rao', 'Asha Rao 40 Katapadi')`)
  const { rows } = await db.query(`select tally_ledger, tally_ledger_listed from public.patients where name = 'Asha Rao'`)
  if (rows[0]?.tally_ledger === 'Asha Rao 40 Katapadi' && rows[0]?.tally_ledger_listed === false) ok('a ledger name saves, not yet seen in his list')
  else bad('a ledger name saves', JSON.stringify(rows))
} catch (e) {
  bad('a ledger name saves', e)
}

try {
  await db.exec(`insert into public.patients (owner_id, name, tally_ledger) values ('${A}', 'Blank', '')`)
  bad('a blank ledger name is refused', 'it was saved')
} catch {
  ok('a blank ledger name is refused')
}

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
