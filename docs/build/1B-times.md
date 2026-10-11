# Brief 1B: time pickers and bookings

**Builder:** Sonnet 5.5, effort medium. **Wave 1**, in parallel with 1A (visit page). **End-to-end port:** `E2E_PORT=3102`. Read [README.md](README.md) first (shared rules).

**Changes (SIMPLIFY.md):** C2, C14; the booking-page part of C10; the booking part of C17; the wording in C21 that is in your files; the redirect routes in C22; C18 on your screens.

## What the doctor should experience
1. **The time pickers start on the right time (C2).** On a website request's "Other time" screen (`/app/requests/[id]`), the time the patient asked for is **already chosen** and "Save and confirm" works at once. On "Move" (`/app/appointments/[id]/move`), the **current time is marked**; picking another time enables Save. The bug: `SlotScheduler.tsx` compares the database's timestamp text (`…+00:00`) with the app's (`….000Z`) as strings, so they never match. Compare **moments**, not text: add a small helper in `src/lib/schedule.ts` (for example `sameInstant(a, b)`, comparing `new Date(x).getTime()`), use it everywhere instants are compared, and unit-test it.
2. **Tap a time; no dragging (C14).** Remove the "slide the name into a block" chip, its drag code and its instruction line from `SlotScheduler.tsx`. Make the bottom Save bar solid (opaque background, safe-area padding), so the times never show through it.
3. **Phone booking for a known patient (C10, C17):** on `/app/book`, after a time is tapped, the patient search shows results **while typing** (name or phone; no Search button). Each result is a full-width row at least 48 dp tall; **tapping the row picks the patient** (no tiny radio buttons). Keep "New patient" for someone new: name, WhatsApp number and **gender** (reuse `src/components/GenderChoice.tsx`, do not edit it; if `bookNewPatient` cannot store gender yet, add it to that action). After **Book appointment**, the big "Send confirmation on WhatsApp" button stays (WhatsApp opens from his tap). Target: tap a free time → type a few digits → tap the row → Book → WhatsApp.
4. **WhatsApp always opens (C17).** Where WhatsApp is opened by code after a server call (`RequestCard.tsx` Confirm, `SlotScheduler.tsx` Save), keep doing that, but if the page is still showing a moment later, show a big **"Open WhatsApp"** button with the same link, so a blocked automatic opening never strands him.
5. **Wording (C21, your files only):** "Back to calendar" → **"Back to Today"**. The WhatsApp message after **moving** an appointment says it **"has been moved to"** the new time (a new `movedMessage` in `src/lib/whatsapp.ts`, unit-tested); a new booking still says "is confirmed".
6. **Remove pages that only redirect (C22):** delete `src/app/app/appointments/[id]/page.tsx` and the `/app/calendar` redirects in `next.config.ts`. (The visit's `/bill` page is deleted by 1A.) Keep `/app/appointments/[id]/move`.
7. **48 dp everywhere on your screens (C18):** time buttons (44 px today), the patient rows, "Change", "Back to …" links, chips and icon buttons.

## Files only you edit
- In `src/components/clinic/`: `SlotScheduler.tsx`, `SlotGrid.tsx`, `BookAppointment.tsx`, `CalendarActions.tsx`, `RequestCard.tsx`.
- `src/app/app/book/page.tsx`, `src/app/app/requests/[id]/page.tsx`, `src/app/app/appointments/[id]/move/page.tsx`; delete `src/app/app/appointments/[id]/page.tsx`.
- `src/lib/actions/appointments.ts`; `src/lib/data/appointments.ts` (keep `getDaySchedule` and `getScheduleForDate` with their current names, inputs and output: 1A uses them); `src/lib/schedule.ts`; `src/lib/whatsapp.ts`; `next.config.ts`.
- `e2e/times.spec.ts` and the unit tests for `schedule.ts` and `whatsapp.ts`.
- `SlotGrid.tsx` is also used by 1A's next-visit picker: keep its props working (add, don't rename or remove).

## Do not touch
Anything owned by 1A: every `Visit*.tsx`, `BillTools.tsx`, `NextVisitPicker.tsx`, `PhotoGallery.tsx`, `MicButton.tsx`, `SmartNoteCard.tsx`, `src/app/app/visits/**`, `src/app/app/patients/**`, `src/lib/actions/visits.ts`, `billing.ts`, `smart-notes.ts`, `patients.ts`, `src/lib/data/visits.ts`, `billing.ts`, `next-visit.ts`, `patient-hub.ts`, `src/lib/billing.ts`, `next-visit.ts`, `visit-status.ts`, `next-action.ts`, `src/lib/ai/**`, `src/app/app/page.tsx`, the privacy page, `e2e/visit.spec.ts`.

## End-to-end test (`e2e/times.spec.ts`), extend it
Keep the three existing tests working (adjust selectors for your changes), and add: the request screen opens with the asked time already chosen and "Save and confirm" enabled; Move from the patient page shows the current time marked, saving a new time sends a "has been moved to" message; booking a known patient from `/app/book` by typing part of the phone and tapping the row, then Book, gives the WhatsApp button. No drag chip anywhere.

## Phone check (the orchestrator and owner will do this on the OnePlus 13)
A website request on Today → Other time: the asked time is highlighted and "Save and confirm" is blue; tap another → Save → WhatsApp with the new time. Patient page → Move: the current time is highlighted; pick another → WhatsApp says "has been moved to". No "slide the name" chip; the Save bar is solid while scrolling. Today → a free time → type four digits → tap the patient row → Book → WhatsApp (or a big "Open WhatsApp" button). After booking, the link says "Back to Today".
