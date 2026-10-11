# Brief 3: clean-up

**Builder:** Sonnet 5.5, effort medium. **Wave 3**, alone. **End-to-end port:** `E2E_PORT=3101`. Read [README.md](README.md) first (shared rules). Unlike the other briefs, you may edit `package.json`, `package-lock.json` and `supabase/**`, but you do **not** run anything against the live database: the orchestrator applies the SQL.

*Refreshed by the orchestrator after Wave 2 (and its fixes 2C/2D), with the "For Wave 3" list from [review-wave2.md](review-wave2.md).*

**Changes (SIMPLIFY.md):** C22–C27, plus whatever is left of C3 (AI) and C13 (Practice mode).

## Tasks
1. **Unused database tables and columns (C23):** write one dated clean-up script `supabase/cleanup-2026-10.sql`, in one transaction:
   - **First, keep every age:** `birth_year` = year of `date_of_birth` where `birth_year` is null, on both `patients` and `booking_requests` (rows written before the age change).
   - **Drop tables:** `reminder_log`, `expenses`, `recurring_expenses`, `day_closes`, `treatment_items`, and the `expense-receipts` storage bucket with its policies. **Keep `share_links`** (the optional Wave 4 short prescription link may use it) and `app_config`.
   - **Drop columns:** `visits.summary`, `notes_original`, `confirmed_at`; `patients.preferred_times`, `is_test`, `date_of_birth`; `booking_requests.date_of_birth`, `area`, `city`, `preferred_date`, `preferred_time`, `is_emergency`, `is_test`; `appointments.reminder_sent_at`; `visit_charges.treatment_item_id`; `payments.kind`, `payments.reference`. Search `src/`, `e2e/`, `tour/` and `supabase/tests/` first and keep anything still used.
   - **Recreate** `submit_booking_request` (without `p_date_of_birth`, keeping `p_gender` and `p_birth_year`) and `confirm_booking_request` without the dropped columns: same rules, same messages, same grants (drop the old signature first).
2. **One schema file (C24):** `supabase/schema.sql` = the whole database after the clean-up, runnable on an empty project. Delete the layered files (`phase2.sql`, `phase3-5.sql`, `patch-*.sql`) and `archive-old-clinic-os.sql`; keep `reset-all-data.sql` (updated for the dropped tables) until go-live. Update `supabase/tests/booking.check.mjs` to build from `schema.sql` (then apply nothing else) and keep every check passing (run it as the README of `supabase/tests` says; the orchestrator's PGlite folder is also fine).
3. **Code that matches the database (C25):**
   - `is_test`: remove from the queries and types: `src/lib/data/visits.ts` (two selects and the `Pick`), `data/billing.ts`, `data/appointments.ts` (select, type, `isTest`), `types.ts` (Patient, VisitDetail patient, BookingRequest).
   - `date_of_birth`: remove from `PATIENT_COLUMNS` (`data/patients.ts`), `types.ts`, the `date_of_birth` branch of `patientAge` (`src/lib/patient-fields.ts` + its test), `ageOn` and its tests if nothing else uses it, and `p_date_of_birth` from `src/lib/actions/booking.ts` and `SubmitBookingRequestArgs` (in the same commit as the new function signature).
   - Row types for removed tables and columns (`types.ts`), unused exports and parameters (`fromVisitId` in `actions/appointments.ts`), the second copy of the photo bucket name (`PhotoGallery.tsx`), stale comments.
   - Visit page: drop the `beforeAction` prop that still sits next to `save`: send the remove buttons and the UPI open through `save` (`BillTools.tsx`, `PaymentCard.tsx`, `VisitFlow.tsx`).
   - `SignOutButton.tsx`: remove the dead `visit-pending:` key (nothing writes it).
   - Remove `@google/genai` and `@anthropic-ai/sdk` (`npm uninstall`); delete `public/images/dr_rahil_action.jpg` and `dr_rahil_portrait.jpg` after checking nothing references them.
   - Tests: `makeRequest` in `e2e/helpers.ts` inserts `preferred_date`, `preferred_time` and `is_test`: drop them (they are nullable or have defaults, so this works before and after the SQL).
4. **Fewer database calls (C27):** money owed read with one summed query (`data/dues.ts`), and Today calls it only when it shows today; no full visit reload after every charge or payment.
5. **Docs (C26):** rewrite PRODUCT.md "Screens and flow" for the six screens (Today, Patients, New patient, Patient, Visit, Pick a time) plus the website booking; cut BUILD_PLAN.md down to status and what is left; fix README (no expenses promise) and `.env.example` (no AI keys); point AGENTS.md at the current docs.

## Order on go-live day (orchestrator)
The new booking call and the new database function must arrive together. Merge → push → wait for the Vercel deploy → apply `cleanup-2026-10.sql` with the CLI straight away (the website booking fails only in the minute between) → PGlite checks, all e2e files and the tour against the live database → one daily job of each kind on the phone.

## Check
A fresh database built from `schema.sql` passes `booking.check.mjs`; all four end-to-end files pass against the current live database (your code must still work before the SQL is applied: removing a column from a select is fine; nothing may write a dropped column); a search of `src/` finds no use of anything removed.
