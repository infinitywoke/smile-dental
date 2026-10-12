# Brief L1: money and visits (logic audit fixes)

**Builder:** Opus 5.5, effort high. Runs in parallel with L2 (calendar and requests). **End-to-end port:** `E2E_PORT=3101`. Read [README.md](README.md) first (shared rules), then [review-logic.md](review-logic.md): every finding below is described there with the invariant it breaks, steps on the phone, evidence and the fix.

**The database migration `supabase/logic-fixes-2026-10.sql` is already applied live** (payments always belong to a visit and block its delete; `visits.resend_needed` set by triggers; one visit per patient per day; booked appointments never in the past or in time off; Confirm keeps website medical alerts; the `visit_money` view). Code against it.

## Fix these findings
- **#1** Delete visit is refused while the visit holds payments, naming the amounts ("This visit holds ₹1,500 in payments (cash ₹1,000, UPI ₹500). If they were a mistake, remove them in Payment first, then delete the visit."). New delete question: "Delete this visit, with its notes, photos and bill?" plus what stays (#13). Remove the loose-payment "advance" code (`patient-hub.ts`).
- **#2** One money rule for every screen: add `patientAccount` to `src/lib/billing.ts` (the code is in the review, checked on 7 cases) with unit tests, and use it on Today (Needs you and the row badges), the patient page (Collect **or** Advance, never both, never Collect when nothing is owed), the visit page (one line for other visits either way; the bottom line and the amount box use what the patient owes; the box shows whenever something is owed) and the WhatsApp message (one bold line: amount to pay or advance). You may read per-visit sums from the `visit_money` view instead of every charge and payment.
- **#3** Send marks done only appointments that have already started.
- **#4** Today hides an appointment only when its own visit is listed (read `visit_id` with appointments: you may edit `APPOINTMENT_SELECT` and the appointment type in `src/lib/data/appointments.ts`, nothing else in that file).
- **#5** "Bill changed – send again" (amber badge) when `resend_needed`; on the visit page Send is the main button again with "The bill changed after the WhatsApp was sent."; `markWhatsappSent` records every send and clears the flag.
- **#6** Changing the next visit after sending returns the moved (or confirmation) WhatsApp link, and NextVisit shows "Open WhatsApp" as Move does. `bookNextVisit` shows database messages (P0001).
- **#7, #21** Photos: delete the file first, then the row; Delete visit empties the visit's whole folder `<doctor>/<visit>/` (rows and stray files) before deleting the visit; stop with an error if storage fails.
- **#13** Deleting a sent visit puts its "done" appointment back to "booked" (leave it if that time was taken since); the question names a next visit that stays booked and that the bill was already sent.
- **#14** `findOrCreateTodaysVisit`: a 23505 from the new one-visit-per-day index means "read today's visit and return it".
- **#18** Notes (and photo kind) saved to a deleted visit say "Couldn't save the note" (check a row came back).
- **#19** ₹0 bill: "No charge" on the card, "No bill" badge, no Payment section in the message.
- **#20** Slow Send: show "Message ready" and record the send when "Open WhatsApp" is tapped, not before.
- **#23a** Delete visit retried after a lost reply: "already gone" is success (take the patient id from the page).
- Types: `Payment.visit_id: string`, `resend_needed` on visits.
- Test fixture: `e2e/today.spec.ts:29` books today at 19:00; after 7:40 PM the database refuses it, so skip that setup once the time is over.

## Files only you edit
`src/lib/billing.ts` (+ test), `src/lib/visit-status.ts`, `src/lib/data/billing.ts`, `dues.ts`, `visits.ts`, `patient-hub.ts`, `types.ts`, `APPOINTMENT_SELECT` + its type in `data/appointments.ts`; `src/lib/actions/visits.ts`, `billing.ts`; in `src/components/clinic/`: `VisitFlow.tsx`, `PaymentCard.tsx`, `BillTools.tsx`, `SendWhatsApp.tsx`, `NextVisit.tsx`, `PhotoGallery.tsx`, `VisitNotes.tsx`, `VisitStatusBadge.tsx`; `src/app/app/page.tsx`, `src/app/app/patients/[id]/page.tsx`, `src/app/app/visits/[id]/page.tsx`; `e2e/visit.spec.ts`, `e2e/today.spec.ts`, `e2e/helpers.ts` (add helpers only).

## Do not touch
L2's files: `src/lib/actions/appointments.ts`, `patients.ts`, `src/lib/whatsapp.ts`, the rest of `data/appointments.ts`, `RequestCard.tsx`, `SlotScheduler.tsx`, `BookAppointment.tsx`, `PatientForm.tsx`, `CalendarActions.tsx`, `src/app/app/book/**`, `src/app/app/requests/**`, `e2e/times.spec.ts`, `supabase/**`. No database changes, no new packages.

## Tests (from the review's section 5)
Unit: `patientAccount` cases (worked example ₹4,499; overpaid then unpaid; old due paid on a new visit; part payment; decimals), ₹0 bill message. E2E: pay ₹200 then Delete visit is refused, remove it and delete → no "Advance"; Today, patient page, card, box and message agree for an advance case; two bookings today and Send leaves the later one booked; a listed visit plus a later booking shows both rows; removing a payment after Send shows "Bill changed – send again"; Change the next visit after Send opens the moved message; deleting a visit empties its photo folder; deleting a sent visit puts its appointment back on Today.

## Done when
All gates pass, including `E2E_PORT=3101 npx playwright test e2e/visit.spec.ts e2e/today.spec.ts e2e/website.spec.ts`.
