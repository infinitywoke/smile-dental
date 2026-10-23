-- Patients' date of birth (owner, 23 Oct 2026: "accept Birthdate instead of Age"). Additive: one new
-- column, nothing removed or changed, so the app as it is now keeps working while this runs. Patients
-- saved with an age keep their birth year; a date of birth sets both (the app keeps birth_year in step,
-- so everything that shows an age from the birth year still works).
alter table public.patients
  add column if not exists birth_date date check (birth_date >= date '1900-01-01');

comment on column public.patients.birth_date is 'Date of birth, when known; birth_year is kept in step with it';
