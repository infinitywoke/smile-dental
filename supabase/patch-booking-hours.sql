-- Phase 5a follow-up (2026-10-11): fit the 40-minute blocks inside the Google Business Profile hours.
-- Run in Supabase: SQL Editor of project pmuecirfwmtsvojxleoq -> New query -> paste -> Run.
-- Safe to run more than once. Run AFTER patch-booking.sql.
--
-- 13 blocks a day: 8:30 9:10 9:50 10:30 11:10 11:50, then 2:30 3:10 3:50 4:30 5:10 5:50 6:30.
-- Fridays have none.
create or replace function public.clinic_slots(p_date date)
returns setof timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_date::timestamp) + make_interval(mins => m)) at time zone 'Asia/Kolkata'
  from unnest(array[510, 550, 590, 630, 670, 710, 870, 910, 950, 990, 1030, 1070, 1110]) as m
  where extract(isodow from p_date) <> 5
$$;

notify pgrst, 'reload schema';
