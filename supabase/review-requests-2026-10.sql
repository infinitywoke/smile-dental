-- Google review request (owner, 15 Oct 2026, step 9): one WhatsApp tap on a visit whose bill was sent,
-- offered for every patient (Google does not allow asking only happy patients). The date it was sent
-- keeps the button from asking the same patient twice by accident.
-- Additive and safe to run twice. Folded into supabase/schema.sql.

begin;

alter table public.patients add column if not exists review_asked_at timestamptz;

commit;
