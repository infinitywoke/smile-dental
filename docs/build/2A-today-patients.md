# Brief 2A: Today, navigation and patients

**Builder:** Sonnet 5.5, effort medium. **Wave 2**, in parallel with 1C (fixes from the Wave 1 review, `1C-visit-fixes.md`); 2B (website form) follows. **End-to-end port:** `E2E_PORT=3102`. Read [README.md](README.md) first (shared rules).

## Facts from Wave 1 (merged 11 Oct)
- **Start a visit with** `<StartVisitButton patientId appointmentId? label? className? />` (`src/components/clinic/StartVisitButton.tsx`): it calls `startVisit`, which reuses today's visit for that patient or creates one, and opens `/app/visits/<id>`. Never link to a "start" URL (Next prefetches links).
- **`nextActionFor`** (`src/lib/next-action.ts`) now returns `{ start: { appointmentId? } }` for start actions instead of an `href`; the patient page renders `StartVisitButton` for those. You may simplify or delete it for C8.
- Visit links ending in `?step=bill` scroll to the visit's payment card (Today's money-owed rows and "Collect" can keep using them); `?step=notes` does nothing.
- Visit state is now two facts: money (`Paid` / `₹X due` / `No bill`) and `WhatsApp sent` (`src/lib/visit-status.ts`, `VisitStatusBadge.tsx`, owned by nobody in Wave 2: use, don't edit). Empty visits (nothing in them) are already hidden.
- The New patient button says "Save and start visit"; `e2e/visit.spec.ts` matches `/start visit/i`, so renaming it to "Start visit" is safe.
- **Still under 48 dp after Wave 1 (tour, OnePlus 13 size), all on your screens:** `BackLink` in `ui.tsx` (about 16-24 px tall), the bottom-bar links "Today" and "Patients" (57x20 and 71x20: the text, not the whole bar, is the link), "Menu" (44x44, being removed), the day-strip arrows on Today (40x40), the "heard from" chips on New patient (32 px tall), "Move" on the patient page (60x32), the patient-name links in lists (20-32 px tall), "Call patient" / "WhatsApp patient" icons (44x44), and the login page's "Back to website" link (20 px).
- Back-gesture results still failing (yours): the "+" pop-up and the ⋯ menu leave the page instead of closing (both are removed in this brief), and a half-typed New patient form loses its typing.

**Changes (SIMPLIFY.md):** C8, C9, C11, C12, C13; the Today and Patients part of C10; the rest of C5, C15, C21; C18 on these screens. **Decisions:** D3 (age instead of date of birth) and D4 (no Practice mode) are yes.

## What the doctor should experience
1. **Today (C11, C21):** one list of today's patients in time order: booked, in the chair, finished. Each of today's booked rows has a **Start** button (1A's `StartVisitButton`) that opens the visit. Website requests stay at the top with one-tap **Confirm** (keep). Money owed shows only when looking at today. One date line instead of two; no "Back to today" link (the first chip of the day strip is Today); "1 bkd" → "1 booked". Keep the day strip, Fridays "off", "Close this day" and free times.
2. **No search box on Today (C10).** **Patients** shows results while typing a name or phone (no Search button); tapping a row opens the patient.
3. **"+" opens New patient directly (C12).** No pop-up.
4. **Practice mode removed (C13, D4):** remove the ⋯ menu, the yellow banner, the TEST badges, "Delete test data" and the practice cookie. **Sign out** moves to the bottom of Patients. Drop the top bar if only the logo is left; each screen has its own title. Remove `is_test` from what new patients are created with (the column stays until Wave 3).
5. **New patient (C9, D3):** **Age** in years on the number keypad (stored as `birth_year` = this year − age; the column exists), no calendar. Only **name and gender** required; phone strongly suggested (the returning-patient check stays). "How did they hear" as chips only (no text box). Errors show just above the button, and the button stays grey until name and gender are filled. Capitalise each word of the name. Saving opens the visit (1A's flow). The same form edits a patient (age shown from `birth_year`, or from `date_of_birth` for older rows).
6. **Patient page (C8, C21):** **Start visit** (or "Open today's visit") always first; a red **Collect ₹X** only when money is owed; **Book appointment** below; Move and Cancel side by side; past visits list.
7. **Back (C5):** a half-typed New patient form is kept until saved or deliberately cleared (don't wipe it when the screen is hidden); Back never leaves the page from a pop-up.
8. **48 dp everywhere on these screens (C18).**

## Files only you edit
- `src/app/app/page.tsx`, `src/app/app/layout.tsx`, `loading.tsx`, `error.tsx`.
- `src/app/app/patients/page.tsx`, `patients/new/page.tsx`, `patients/[id]/page.tsx`, `patients/[id]/edit/page.tsx`.
- In `src/components/clinic/`: `BottomNav.tsx`, `HeaderMenu.tsx`, `PatientForm.tsx`, `ui.tsx`, `useResetOnHide.ts`.
- `src/lib/actions/patients.ts`, `src/lib/actions/practice.ts`, `src/lib/practice.ts`, `src/lib/next-action.ts` (delete if no longer needed); `src/lib/data/patients.ts`, `patient-hub.ts`, `dues.ts`.
- Only to remove TEST badges and the practice flag: `RequestCard.tsx`, `BookAppointment.tsx`, `bookNewPatient` in `src/lib/actions/appointments.ts`. (The visit header's TEST badge is removed by 1C: do not edit `VisitFlow.tsx`.)
- `e2e/today.spec.ts` and the unit tests beside your files. **Do not edit `e2e/visit.spec.ts` or `e2e/times.spec.ts`** (builder 1C owns them now). If your changes break steps in them (for example "+" now opening New patient directly, or the Patients search button going away), list those steps in your report; the orchestrator fixes them when merging.

## Also from the Wave 1 review (`review-wave1.md`)
- **#15:** "Open today's visit" on the patient page links to `/app/visits/<id>` with no `step` (when you delete or rewrite `next-action.ts`).
- **#12** (linking today's appointment when the patient already has a visit today) is fixed by 1C in `startVisit`; Today's Start buttons just pass `appointmentId`.

## Phone check
Today shows one list of today's patients by time; a booked one has Start. No search box on Today; on Patients, typing "9717" shows matches. "+" opens New patient; type a name, Back, open it again: the name is still there. Age opens the number keypad; "heard from" is chips only; Start visit without a gender shows the message just above the button. Patient page: Start visit first; Collect only when owed; Move and Cancel side by side. No yellow banner, no ⋯ menu; Sign out at the bottom of Patients. Tour: no Clinic OS control below 48 dp; the walk-in takes about 10 taps over 3 screens.
