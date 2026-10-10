-- Marks test patients so trial data can be deleted in one go.
-- Run in Supabase: SQL Editor of project pmuecirfwmtsvojxleoq -> New query -> paste -> Run.
-- Safe to run more than once. Deleting a patient also deletes their visits and photo
-- records (on delete cascade); the app's "Delete test patients" button removes the photo files.

alter table public.patients add column if not exists is_test boolean not null default false;

-- Patients created by the automated tests (all named "E2E-...") count as test data
update public.patients set is_test = true where name like 'E2E-%' and not is_test;

create index if not exists patients_owner_test_idx on public.patients (owner_id) where is_test;

notify pgrst, 'reload schema';
