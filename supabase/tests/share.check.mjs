// Checks supabase/share-links-2026-10.sql in a throwaway Postgres (PGlite): the doctor makes a link for his
// own visit only; anyone with the exact code sees that visit's date, the first name and the photos, and
// nothing else; a link that ran out says so; a wrong or short code shows nothing; the table itself stays
// closed to anyone signed out; the nightly tidy-up clears links that ran out a month ago.
// Needs @electric-sql/pglite, which is not a project dependency: install it in a scratch folder and run
// it from there (copy this file next to node_modules): node share.check.mjs <path to this repo>
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
const anon = async () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`)
const admin = async () => db.exec('reset role')
const rows = async (sql) => (await db.query(sql)).rows
const err = async (sql) => { try { await db.query(sql); return null } catch (e) { return e.message } }
const shared = async (code) => (await rows(`select public.shared_photos('${code}') as s`))[0]?.s ?? null

try {
  await db.exec(read('schema.sql'))
  await db.exec(read('schema.sql'))
  await db.exec(read('share-links-2026-10.sql'))
  await db.exec(read('share-links-2026-10.sql'))
  ok('schema.sql applies twice, and the change file twice on top of it')
} catch (e) {
  bad('apply schema.sql and the change file', e)
}

const CODE = 'Abc123_-Abc123_-Abc123_-Abc123_-'
const OLD = 'Old00000Old00000Old00000Old00000'
const photos = `'[{"label":"Prescription","url":"https://example.supabase.co/storage/v1/object/sign/visit-photos/a.jpg?token=x"}]'::jsonb`

await as(A)
const patient = (await rows(`insert into public.patients (name, language) values ('  Asha  Rao', 'kn') returning id`))[0]
const visit = (await rows(`insert into public.visits (patient_id, visit_date) values ('${patient.id}', '2026-10-12') returning id`))[0]
await db.exec(`insert into public.share_links (visit_id, token, photos) values ('${visit.id}', '${CODE}', ${photos})`)
ok('the doctor makes a link for his visit, with its photos')
check('a link may hold at most 10 photos', (await err(`insert into public.share_links (visit_id, token, photos)
  select '${visit.id}', 'Ten00000Ten00000Ten00000Ten00000', jsonb_agg('{}'::jsonb) from generate_series(1, 11)`)) !== null)
check('the photos must be a list', (await err(`insert into public.share_links (visit_id, token, photos) values ('${visit.id}', 'Obj00000Obj00000Obj00000Obj00000', '{}'::jsonb)`)) !== null)
check('a code shorter than 32 characters is refused', (await err(`insert into public.share_links (visit_id, token) values ('${visit.id}', 'short')`)) !== null)

await as(B)
check('another login cannot make a link for his visit', (await err(`insert into public.share_links (visit_id, token) values ('${visit.id}', 'Bbb00000Bbb00000Bbb00000Bbb00000')`)) !== null)
check('another login sees none of his links', (await rows(`select 1 from public.share_links`)).length === 0)

await anon()
const page = await shared(CODE)
check('anyone with the exact code sees the visit date, the first name, the language and the photos',
  page?.visit_date === '2026-10-12' && page?.first_name === 'Asha' && page?.language === 'kn'
    && page?.photos?.[0]?.label === 'Prescription' && !!page?.expires_at, JSON.stringify(page))
check('and nothing else about the patient', JSON.stringify(Object.keys(page ?? {}).sort()) === '["expires_at","first_name","language","photos","visit_date"]', JSON.stringify(page))
check('a code one letter off shows nothing', (await shared(CODE.slice(0, -1) + 'x')) === null)
check('a short code shows nothing', (await shared('Abc123')) === null)
check('signed out, the links table itself is closed', (await err(`select * from public.share_links`)) !== null)

// One that ran out, one that ran out over a month ago
await admin()
await db.exec(`
  update public.share_links set expires_at = now() - interval '1 day' where token = '${CODE}';
  insert into public.share_links (owner_id, visit_id, token, expires_at) values ('${A}', '${visit.id}', '${OLD}', now() - interval '31 days');
`)
await anon()
check('a link that ran out says so, and shows nothing else', JSON.stringify(await shared(CODE)) === '{"expired":true}', JSON.stringify(await shared(CODE)))
await admin()
await rows(`select v from public.tidy_old_records() v`)
const left = (await rows(`select token from public.share_links order by token`)).map((r) => r.token)
check('the tidy-up clears links that ran out over a month ago, and keeps the rest', JSON.stringify(left) === JSON.stringify([CODE]), JSON.stringify(left))

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
