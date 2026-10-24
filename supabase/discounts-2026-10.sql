-- Discounts on a visit's bill (owner, 24 Oct 2026: "Add the ability to apply discounts to patient bills,
-- with correct calculations and records"). A discount is a bill line of its own kind, 'discount', whose
-- amount is below zero, so every total, balance and amount due (visit_money and everything that reads
-- it) takes it off with no other change; Tally still gets only the money received. Every other line
-- stays at zero or more. Changes two checks on visit_charges and nothing else: every row there already
-- passes both, so the app as it is keeps working while this runs. Safe to run again.

alter table public.visit_charges drop constraint if exists visit_charges_kind_check;
alter table public.visit_charges add constraint visit_charges_kind_check
  check (kind in ('item', 'extra', 'discount'));

alter table public.visit_charges drop constraint if exists visit_charges_amount_check;
alter table public.visit_charges add constraint visit_charges_amount_check
  check (case when kind = 'discount' then amount < 0 else amount >= 0 end);

notify pgrst, 'reload schema';
