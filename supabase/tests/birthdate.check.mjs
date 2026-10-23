// Checks the date of birth (supabase/birth-date-2026-10.sql) in a throwaway Postgres (PGlite): the schema
// with it applies twice, the change file applies on top of it (twice: safe to repeat), a date of birth
// saves, and one before 1900 is refused.
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder and run
// it from there (copy this file next to node_modules): node birthdate.check.mjs <path to this repo>
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

try {
  await db.exec(read('schema.sql'))
  await db.exec(read('schema.sql'))
  await db.exec(read('birth-date-2026-10.sql'))
  await db.exec(read('birth-date-2026-10.sql'))
  ok('schema.sql applies twice, and the change file twice on top of it')
} catch (e) {
  bad('apply schema.sql and the change file', e)
}

try {
  await db.exec(`insert into public.patients (owner_id, name, birth_date, birth_year) values ('${A}', 'Born 1985', '1985-03-12', 1985)`)
  const { rows } = await db.query(`select birth_date::text as born from public.patients where name = 'Born 1985'`)
  if (rows[0]?.born === '1985-03-12') ok('a date of birth saves')
  else bad('a date of birth saves', JSON.stringify(rows))
} catch (e) {
  bad('a date of birth saves', e)
}

try {
  await db.exec(`insert into public.patients (owner_id, name, birth_date) values ('${A}', 'Too old', '1899-12-31')`)
  bad('a date before 1900 is refused', 'it was saved')
} catch {
  ok('a date before 1900 is refused')
}

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
