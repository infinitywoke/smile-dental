-- Each patient's own Tally ledger (owner, 25 Oct 2026: "OK"). Dr. Rahil's books credit every receipt to the
-- patient's ledger under Direct Incomes, named name + age + place (docs/TALLY.md). Clinic OS keeps the name
-- per patient: matched from his List of Accounts, or made by Clinic OS the first time a file needs it (and
-- then created in that file). With a ledger per patient, the single income ledger is needed only for
-- "one entry per day".
-- Additive, safe to run twice; the app as it is now keeps working while this runs. Folded into schema.sql.

begin;

alter table public.patients
  add column if not exists tally_ledger text check (char_length(tally_ledger) between 1 and 100),
  add column if not exists tally_ledger_listed boolean not null default false;

comment on column public.patients.tally_ledger is 'The patient''s ledger in Tally, exactly as named there';
comment on column public.patients.tally_ledger_listed is 'Seen in his List of Accounts; otherwise Clinic OS creates it in each file that uses it';

alter table public.tally_settings alter column income_ledger drop not null;

commit;
