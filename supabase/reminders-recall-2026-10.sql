-- Step 9 extras (owner, 15 Oct 2026): tomorrow's reminders, "Didn't come" with a call-back list, and the
-- 6-month check-up recall. Each list empties itself as Dr. Rahil taps, so each needs one date:
-- - appointments.reminded_at: the reminder WhatsApp was opened for it;
-- - appointments.followed_up_at: a missed appointment was followed up (or set aside) from the call-back list;
-- - patients.recalled_at: the check-up reminder was sent (or skipped); the patient comes back on the
--   list six months after their next visit.
-- Additive and safe to run twice. Folded into supabase/schema.sql.

begin;

alter table public.appointments add column if not exists reminded_at timestamptz;
alter table public.appointments add column if not exists followed_up_at timestamptz;
alter table public.patients add column if not exists recalled_at timestamptz;

create index if not exists appointments_owner_missed_idx
  on public.appointments (owner_id, starts_at desc) where status = 'no_show';

commit;
