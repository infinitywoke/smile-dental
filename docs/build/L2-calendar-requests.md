# Brief L2: calendar, requests and patients (logic audit fixes)

**Builder:** Opus 5.5, effort high. Runs in parallel with L1 (money and visits). **End-to-end port:** `E2E_PORT=3102`. Read [README.md](README.md) first (shared rules), then [review-logic.md](review-logic.md): every finding below is described there with the invariant it breaks, steps on the phone, evidence and the fix.

**Database:** the migration `supabase/logic-fixes-2026-10.sql` (in the repo) will be applied live by the orchestrator, possibly while you work. Your code must work both before and after it: nothing you write depends on its new column, view or triggers, and a database refusal (P0001, e.g. "That time has already passed.", "That time is blocked off in your calendar.") must be shown to the doctor as its message.

## Fix these findings
- **#8 Duplicate patients:** (a) one-tap Confirm never creates a patient when the phone is already known and there is not exactly one same-name match: it opens the request page saying "This number belongs to <name>" (`confirmRequestAsAsked` returns `needsChoice`, `RequestCard` routes there); (b) the request page pre-selects the match when one patient has the same name or when only one patient has that number; (c) `bookNewPatient` looks the number up first and shows matches with "Book <name>" or "Someone new" (family members share phones); (d) New patient sends an id made on the phone and `createPatient` treats 23505 as already saved (as visits do).
- **#10** Confirm and Decline are safe to repeat: on "already handled", read the request; booked → return the confirmation link for its appointment's real time as a success; declined → the decline link. Add "Send confirmation again" on a booked request's page.
- **#11** "Close this day" (and blocking any time) is refused while booked appointments overlap, naming them ("Prakash Shetty (10:30 AM) is booked on this day. Move or cancel first, then close the day."); mention waiting website requests for that day.
- **#12** "Reopen" removes only time off inside that one block; inside a closed day the notice says "This whole day is closed" and the button "Reopen the day".
- **#17** A waiting request whose time has passed, or asked more than 24 h ago, says so on its card ("Time passed" / "No longer held, asked 2 days ago") and offers Decline right there.
- **#22** The day strip counts only booked appointments without a visit.
- **#23b** Book retried after a lost reply: on 23P01, if the clash is this patient at this time, return success with the WhatsApp link.
- **#24** After Cancel, offer an optional "Tell <first name> on WhatsApp" with a short professional cancellation message (`cancelledMessage` in `src/lib/whatsapp.ts`, same look as the other messages).
- **Database files (no live changes):** fold `logic-fixes-2026-10.sql` into `supabase/schema.sql` so a fresh project matches; add `supabase/tests/logic.check.mjs` from the audit's PGlite proofs (`…/scratchpad/pgtest/logic-fixes.test.mjs`, `fk-order*.mjs`, see the review's appendix) and keep `booking.check.mjs` passing (both from `schema.sql`).

## Files only you edit
`src/lib/actions/appointments.ts`, `src/lib/actions/patients.ts`, `src/lib/whatsapp.ts` (+ test), `src/lib/data/appointments.ts` (except `APPOINTMENT_SELECT` and its type, which L1 edits), `src/lib/data/patients.ts`; in `src/components/clinic/`: `RequestCard.tsx`, `SlotScheduler.tsx`, `BookAppointment.tsx`, `PatientForm.tsx`, `CalendarActions.tsx`; `src/app/app/book/**`, `src/app/app/requests/**`, `src/app/app/patients/new/**`, `src/app/app/appointments/**`; `e2e/times.spec.ts`, `e2e/helpers.ts` (add helpers only); `supabase/schema.sql`, `supabase/tests/**`.

## Do not touch
L1's files (money, visits, Today, the patient page, `e2e/visit.spec.ts`, `e2e/today.spec.ts`). No live database changes, no new packages.

## Tests
E2E (`times.spec.ts`): a known patient and a request with another spelling → one-tap Confirm makes no second patient and the request page pre-selects the match; phone booking with a known number shows the match; Confirm, then Confirm again from the old card still opens the WhatsApp confirmation; a booked day can't be closed; reopening one block in a closed day keeps the day closed; Cancel offers the WhatsApp message. Unit: `cancelledMessage`, the request-card states. PGlite: `logic.check.mjs` passes on `schema.sql`.

## Done when
All gates pass, including `E2E_PORT=3102 npx playwright test e2e/times.spec.ts` and both PGlite checks.
