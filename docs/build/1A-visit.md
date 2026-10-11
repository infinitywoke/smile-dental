# Brief 1A: the visit is one page

**Builder:** Opus 5.5, effort high. **Wave 1**, in parallel with 1B (time pickers). **End-to-end port:** `E2E_PORT=3101`. Read [README.md](README.md) first (shared rules).

**Changes (SIMPLIFY.md):** C1, C3, C4, C6, C7, C16; the visit parts of C5, C15, C17; C18 on the visit screens. **Decisions:** D1 (one visit page) and D2 (no AI tidy-up) are yes.

## What the doctor should experience
1. He taps **Start visit** (on the patient page today; Today gets its own Start buttons in Wave 2) or saves the **New patient** form. A visit is created (or today's existing visit for that patient is reused) and **one Visit page** opens at once. There is no "New visit" page and there are no Notes / Bill / Send tabs or "Next" buttons. Pressing Start twice never makes two visits.
2. **Back from the Visit page goes to where he came from** (Today or the patient page), never to the New patient form.
3. The Visit page, top to bottom:
   - **Header:** patient name, today's date, the red medical alert (keep the existing component).
   - **Notes:** one big text box with **Dictate** (keep `MicButton.tsx` behaviour: on until Stop). Notes **save by themselves** about 1.5–2 seconds after typing stops, and before any other button on the page acts. A small line says "Saving…", then "Saved". With no internet it says the note is kept on this phone and saves when the connection is back (keep the on-phone draft as the safety net; clear it once saved).
   - **Photos:** "Take photo" and "Gallery" (keep them separate). A photo **uploads the moment it is picked** and appears on the page. Under each photo, three 48 dp chips: **Prescription · X-ray · Other** (one tap, stored as the photo's caption); no caption typing. Tapping a photo opens the existing viewer (Back closes it).
   - **Bill:** the lines and the total. **Add charge** opens the clinic price list (`priceListOptions()` in `src/lib/pricing.ts`) as a full-screen list with a filter box at the top. Tapping a **fixed-price** item adds it at once. A **range** or **formula** item asks for the agreed amount (number keypad). **Other charge** asks "What for" and "Amount". Back closes the list. Each line can be removed (48 dp target).
   - **Payment:** one card with total, payments so far and what is still due. Two big buttons: **Cash received** and **UPI**. The amount box is pre-filled with what is due (number keypad, editable). **UPI** opens a **full-screen QR** for that amount (existing `src/lib/upi.ts`) with **Payment received** under it; Back closes it. Remove "Show UPI QR" / "Hide QR" and "Open in a UPI app on this phone". Show "Paid in full" when nothing is due. Links that end in `?step=bill` (Today's money-owed rows, the patient page's "Collect") must land on this payment card (scroll to it).
   - **Next visit:** shows **"None"** by default. One tap on the suggestion ("Book Sun 18 Oct, 8:30 AM"; keep the existing suggestion logic, but only work it out when shown) books it; "Pick another time" opens the existing time choice (`NextVisitPicker.tsx` with `getScheduleForDate`); Back closes it. Nothing is booked unless he taps. If the patient already has an appointment coming up, show it instead.
   - **Send on WhatsApp:** one big green button. It opens the patient's WhatsApp chat with the one message (bill, payments, balance, next appointment, a 30-day link to each ticked photo). Open WhatsApp **from his tap** (a real link or `window.location` inside the click handler, not after a slow server round-trip; if the message needs the server first, show a big "Open WhatsApp" button when it is ready). Prescription photos are ticked to send by default; he can tick X-rays. No copy of the message on screen. After sending, the visit shows **"WhatsApp sent"**.
   - At the very bottom, a small **Delete visit** (with a confirm). This replaces the visit's ⋯ menu.
4. **Two plain facts instead of four visit states (C15):** wherever a visit is shown, money (Paid / ₹X due / No bill) and whether the WhatsApp was sent. Remove "Finish without sending", "Reopen" and the "Visit done" box. `visits.closed_at` now means "WhatsApp sent".
5. A visit with nothing in it (no notes, photos, charges or payments) is **not listed** anywhere (Today, patient page).
6. **"Tidy up with AI" is gone (C3, D2).** Delete `SmartNoteCard.tsx`, `src/lib/actions/smart-notes.ts` and all of `src/lib/ai/` with their tests. Do not touch `package.json` (the AI packages are removed in Wave 3). Update the "Help from AI" section of the privacy page to say no AI is used on visit notes; keep the sentence that dictation uses the phone's own speech recognition.
7. The WhatsApp message (`visitMessage` in `src/lib/billing.ts`): first name only (as now), photos named by type ("Prescription: <link>", "X-ray: <link>"), never gender.

## Files only you edit
- `src/app/app/visits/[id]/page.tsx`; delete `src/app/app/visits/[id]/bill/page.tsx` and `src/app/app/patients/[id]/visits/new/page.tsx` (and its folder).
- In `src/components/clinic/`: `VisitFlow.tsx`, `VisitNotesStep.tsx`, `VisitBillStep.tsx`, `VisitSendStep.tsx`, `VisitEditor.tsx`, `VisitMenu.tsx`, `VisitStatusBadge.tsx`, `BillTools.tsx`, `NextVisitPicker.tsx`, `PhotoGallery.tsx`, `MicButton.tsx`, `SmartNoteCard.tsx`; any new visit components (for example `StartVisitButton.tsx`, `PriceListSheet.tsx`, `PaymentCard.tsx`). Rename or delete freely within this list.
- `src/lib/actions/visits.ts`, `src/lib/actions/billing.ts`, `src/lib/actions/smart-notes.ts`; `src/lib/data/visits.ts`, `src/lib/data/billing.ts`, `src/lib/data/next-visit.ts`; `src/lib/billing.ts`, `src/lib/next-visit.ts`, `src/lib/visit-status.ts`, `src/lib/resize-image.ts`, `src/lib/dictation.ts`; `src/lib/ai/**`; `src/lib/data/types.ts` (visit types only).
- `src/app/(public)/privacy/page.tsx` (the AI section only).
- `e2e/visit.spec.ts` and the unit tests beside the files above.
- **Small touch points (nothing else in these files):**
  - `src/lib/actions/patients.ts`: only `createPatient`, so it creates the visit and redirects to it with replace.
  - `src/app/app/patients/[id]/page.tsx`: only the Start visit button (a button that calls your start action; links cannot create a visit, because Next prefetches links).
  - `src/lib/next-action.ts` and its test: only the two links to the deleted "New visit" page.
  - `src/lib/data/patient-hub.ts` and `src/app/app/page.tsx`: only if the visit-status helper changes shape, and to hide empty visits.

## Do not touch
Anything owned by 1B: `SlotScheduler.tsx`, `SlotGrid.tsx`, `BookAppointment.tsx`, `CalendarActions.tsx`, `RequestCard.tsx`, `src/app/app/book/**`, `src/app/app/requests/**`, `src/app/app/appointments/**`, `src/lib/actions/appointments.ts`, `src/lib/data/appointments.ts`, `src/lib/schedule.ts`, `src/lib/whatsapp.ts`, `next.config.ts`, `e2e/times.spec.ts`. You may **use** their exports (`getScheduleForDate`, `getDaySchedule`, `SlotGrid`, `whatsappLink`, schedule helpers) with their current names and inputs.

## End-to-end test (`e2e/visit.spec.ts`), rewrite for the new flow
At least: New patient → saving opens the Visit page (URL `/app/visits/<id>`), and Back from it does not show the New patient form; notes save by themselves ("Saved" appears, and the text is there after a reload); a photo uploads by itself and can be marked Prescription; one tap on a fixed-price item adds a bill line; part payment by cash leaves "₹X due"; UPI opens the QR and Back closes it; Next visit says "None" by default and nothing is booked unless tapped; Send on WhatsApp opens `wa.me/91<phone>` with the bill, the balance and the prescription link (keep the 29–31 day link check); Today lists the visit with its money owed, and "Collect" lands on the payment card and settles it; Start visit twice from the patient page opens the same visit.

## Phone check (the orchestrator and owner will do this on the OnePlus 13)
Today → + → New patient → fill in → Start visit: one Visit page opens. Type a note, wait 2 s: "Saved". Aeroplane mode on, type more: "kept on this phone"; off: it saves. Take a photo: it appears; tap Prescription. Add charge → "Scaling – Moderate case ₹600": the line and total appear with no typing. Amount 500 → Cash received → "₹100 due". UPI → full-screen QR; Back closes it. Next visit says None; tap the suggestion: booked. Send on WhatsApp → the patient's chat with the message. Back from the Visit page goes to Today. No "Tidy up with AI" anywhere.
