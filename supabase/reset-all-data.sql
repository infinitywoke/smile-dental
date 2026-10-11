-- ERASE ALL CLINIC DATA. This cannot be undone.
--
-- Use it once, before going live, to remove every test patient, visit, bill, payment,
-- appointment and website request. Nothing in it touches the setup:
--   * the sign-in account (auth.users) stays,
--   * public.app_config stays (it is what lets the website's booking form find the clinic),
--   * tables, policies and functions stay.
--
-- How to run: Supabase dashboard of the clinic project (pmuecirfwmtsvojxleoq)
--   -> SQL Editor -> New query -> paste this whole file -> Run.
-- Then empty the photo files: Storage -> visit-photos -> select all -> Delete
-- (deleting rows here does not delete the files themselves).
--
-- The last query shows a count for every table; all of them should be 0.

begin;

truncate table
  public.reminder_log,
  public.share_links,
  public.payments,
  public.visit_charges,
  public.treatment_items,
  public.appointments,
  public.booking_requests,
  public.visit_photos,
  public.visits,
  public.patients,
  public.expenses,
  public.recurring_expenses,
  public.day_closes,
  public.time_off
restart identity cascade;

commit;

select 'patients' as "table", count(*) from public.patients
union all select 'visits', count(*) from public.visits
union all select 'visit_photos', count(*) from public.visit_photos
union all select 'visit_charges', count(*) from public.visit_charges
union all select 'payments', count(*) from public.payments
union all select 'treatment_items', count(*) from public.treatment_items
union all select 'appointments', count(*) from public.appointments
union all select 'booking_requests', count(*) from public.booking_requests
union all select 'share_links', count(*) from public.share_links
union all select 'time_off', count(*) from public.time_off
union all select 'expenses', count(*) from public.expenses
union all select 'day_closes', count(*) from public.day_closes
union all select 'app_config (kept: should be 1)', count(*) from public.app_config;
