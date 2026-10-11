# Brief 2C: Clinic OS fixes from the Wave 2 review

**Builder:** Opus 5.5, effort high. Runs in parallel with 2D (website). **End-to-end port:** `E2E_PORT=3101`. Read [README.md](README.md) first (shared rules), then [review-wave2.md](review-wave2.md): each finding below is described there with evidence and a suggested fix.

## Fix these review findings
- **#1: a half-typed New patient form can be cleared, and it is obvious when it comes back.** On New patient (not on Edit), once anything is typed, show a 48 dp **"Start fresh"** button at the top of the form that empties every field (phone, name, gender, age, address, medical alerts, heard from) and the returning-patient box. When the form is shown again with typing in it (after Back), the top line says **"Continuing <name>"** (or "Continuing a half-typed patient" without a name) next to Start fresh, so the previous person's medical alert can't slip onto the next walk-in. Keep the rest of C5: typing survives Back until saved or cleared.
- **#2: a photo never stays on "Uploading…" for good.** Give each upload try about 45 s, then mark it failed so the 10 s retry and Remove take over. A try that timed out but did reach the server must not create a second photo when retried (use the existing per-photo key; treat "already there" as success). Show the Remove (X) button while uploading too.
- **#3: a failed Patients search never leaves the old list on screen as if it were the results.** On error: clear the rows and say "Couldn't search. Check the internet." Show "N results for …" only for results that came back for that query.
- **#4: Today shows a seen patient's whole name.** Name on its own first line; the time and the badges on the second line, in place of the "₹600 billed · ₹400 paid · ₹200 due" line (badges only). In "Needs you", skip a due whose visit is already a row in today's list (it shows its badge there).
- **#8: Send never sits on "Preparing…" for ever.** After about 15 s, show "Still trying… Check the internet." and let him tap Send again (server actions run one after another and every save is idempotent). Keep the 2 s rule and the "Open WhatsApp" fallback exactly as they are.
- **#10: an appointment is linked to a visit only on its own day.** `linkAppointment` accepts only appointments starting today (India time). `markWhatsappSent` also marks the patient's other booked appointments today as done.
- **From "For Wave 3":** `lookupPhone` calls `getDoctor()` itself (`src/lib/actions/patients.ts`).

Not now: #9 (keep failed photos in IndexedDB), after go-live.

## Files only you edit
- In `src/components/clinic/`: `PatientForm.tsx`, `PatientSearch.tsx`, `PhotoGallery.tsx`, `SendWhatsApp.tsx`, `VisitFlow.tsx`, `VisitStatusBadge.tsx`.
- `src/app/app/page.tsx`; `src/lib/actions/patients.ts`, `src/lib/actions/visits.ts`; `src/lib/data/visits.ts`, `src/lib/data/dues.ts`.
- `e2e/today.spec.ts`, `e2e/visit.spec.ts` (and `e2e/helpers.ts` if a helper is needed).

## Do not touch
The website files builder 2D owns: `src/components/site/**`, `src/app/(public)/**`, `src/lib/actions/booking.ts`, `src/app/login/**`, `e2e/website.spec.ts`. No database changes, no new packages.

## Tests
Add e2e steps for: Start fresh empties the form (and "Continuing <name>" shows after Back); a failed search says so (Playwright `context.setOffline(true)` or route abort); the Today row shows the full name with the time on the second line and no duplicate due in "Needs you". Unit-test any pure helper you add.

## Done when
All gates pass, including `E2E_PORT=3101 npx playwright test e2e/today.spec.ts e2e/visit.spec.ts e2e/times.spec.ts`.
