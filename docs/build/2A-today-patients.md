# Brief 2A: Today, navigation and patients

**Builder:** Sonnet 5.5, effort medium. **Wave 2**, in parallel with 2B (website form). **End-to-end port:** `E2E_PORT=3101`. Read [README.md](README.md) first (shared rules).

> Orchestrator: refresh this brief after Wave 1 merges (file names, the Start visit button and the visit-status helper may have changed).

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
- Only to remove TEST badges and the practice flag: `RequestCard.tsx`, `BookAppointment.tsx`, the visit header component, `bookNewPatient` in `src/lib/actions/appointments.ts`.
- `e2e/today.spec.ts`, plus `e2e/visit.spec.ts` and `e2e/times.spec.ts` where they go through Today, "+", Patients or the patient page; the unit tests beside your files.

## Phone check
Today shows one list of today's patients by time; a booked one has Start. No search box on Today; on Patients, typing "9717" shows matches. "+" opens New patient; type a name, Back, open it again: the name is still there. Age opens the number keypad; "heard from" is chips only; Start visit without a gender shows the message just above the button. Patient page: Start visit first; Collect only when owed; Move and Cancel side by side. No yellow banner, no ⋯ menu; Sign out at the bottom of Patients. Tour: no Clinic OS control below 48 dp; the walk-in takes about 10 taps over 3 screens.
