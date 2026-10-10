-- R2: visit flow patches
-- Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once. Run AFTER phase2.sql and phase3-5.sql.
--
-- What it adds:
--   * visits.closed_at   when the visit was finished and marked done
--   * index on visits(owner_id, closed_at)

alter table public.visits add column if not exists closed_at timestamptz;
create index if not exists visits_owner_closed_idx on public.visits (owner_id, closed_at);
