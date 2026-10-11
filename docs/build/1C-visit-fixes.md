# Brief 1C: fixes from the Wave 1 review

**Builder:** Opus 5.5, effort high. Runs in parallel with 2A (Today, navigation, patients). **End-to-end port:** `E2E_PORT=3101`. Read [README.md](README.md) first (shared rules), then the review [review-wave1.md](review-wave1.md): every finding below is described there with evidence and a suggested fix.

## Fix these review findings
- **#1 (blocker): the WhatsApp message must include what was saved just before the tap.** `markWhatsappSent` returns what the message needs, read fresh from the database after the earlier actions (the next appointment and the bill, or the finished message text), and `SendWhatsApp` always builds the link from that reply, with or without ticked photos. Keep the rule: open WhatsApp if the reply comes within ~2 s of the tap, otherwise show the big "Open WhatsApp" button. Add an e2e step that taps Send straight after booking the suggested next visit (no wait) and finds "*Next appointment*" in the message. Also #8 (only show "WhatsApp sent" once it is recorded).
- **#2: the booking page is never blank.** `src/app/app/book/page.tsx`: when the chosen day has no times left (or is closed), open the next open day; if you keep showing the empty day, say "No times left today" with a big "Next day" button.
- **#3: Start visit never reopens another day's visit.** `findOrCreateTodaysVisit` in `src/lib/data/visits.ts` returns an existing id only if it belongs to the same patient and is dated today; otherwise it creates a new visit. `StartVisitButton.tsx` makes a fresh id for each new start.
- **#4: a charge or payment is never saved twice.** Make one id on the phone per intended charge or payment (like the photo key), pass it to `addCharge` / `recordPayment`, insert with that `id`, and treat "already exists" (`23505`) as success.
- **#5: photos that fail to upload are not lost silently.** Retry on `online` and every 10 s (as the notes do); Send warns "1 photo still uploading" (or "failed") above the button and waits, unless he removes that photo.
- **#6: an old notes save never overwrites newer notes** (save the newest text from the on-phone draft; clear the draft only if it still equals what was saved). Also #7 (say "No internet" only when the request itself failed; on a server error say "Couldn't save the note" and stop retrying).
- **#9:** a "Change" button on a next visit booked from this visit (opens the same picker).
- **#10:** "Earlier balance" counts only money from before this visit (or rename it "Other visits"); the total stays right, in the card and in the WhatsApp message.
- **#11:** more than 10 ticked photos says "You can send up to 10 photos at a time."
- **#12:** when `startVisit` gets an `appointmentId` and the patient already has a visit today, link that appointment to the visit if none is linked yet.
- **#13:** the patient-name link at the top of the visit is at least 48 dp tall.
- **#14:** the time pickers' Save bar sits right on top of the bottom bar with a solid background, so no times show through (`SlotScheduler.tsx`).
- **Decision D4 on the visit page:** remove the TEST badge from the visit header (builder 2A removes Practice mode everywhere else and does not touch `VisitFlow.tsx`).

## Files only you edit
- In `src/components/clinic/`: `VisitFlow.tsx`, `VisitNotes.tsx`, `PhotoGallery.tsx`, `PriceListSheet.tsx`, `PaymentCard.tsx`, `NextVisit.tsx`, `NextVisitPicker.tsx`, `SendWhatsApp.tsx`, `StartVisitButton.tsx`, `FullScreen.tsx`, `BillTools.tsx`, `SlotScheduler.tsx`.
- `src/app/app/book/page.tsx`, `src/app/app/visits/[id]/page.tsx`.
- `src/lib/actions/visits.ts`, `src/lib/actions/billing.ts`; `src/lib/data/visits.ts`, `src/lib/data/billing.ts`, `src/lib/data/next-visit.ts`; `src/lib/billing.ts` (+ its test).
- `e2e/visit.spec.ts` and `e2e/times.spec.ts`.

## Do not touch
Everything builder 2A owns: `src/app/app/page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `src/app/app/patients/**`, `BottomNav.tsx`, `HeaderMenu.tsx`, `PatientForm.tsx`, `ui.tsx`, `useResetOnHide.ts`, `RequestCard.tsx`, `BookAppointment.tsx`, `src/lib/actions/patients.ts`, `practice.ts`, `appointments.ts`, `src/lib/practice.ts`, `next-action.ts`, `src/lib/data/patients.ts`, `patient-hub.ts`, `dues.ts`, `e2e/today.spec.ts`. Keep `StartVisitButton`'s props (`patientId`, `appointmentId?`, `label?`, `className?`) as they are: 2A uses it.

## Done when
All gates pass, including `E2E_PORT=3101 npx playwright test e2e/visit.spec.ts e2e/times.spec.ts`.
