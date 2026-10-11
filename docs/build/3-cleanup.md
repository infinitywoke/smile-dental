# Brief 3: clean-up

**Builder:** Sonnet 5.5, effort medium. **Wave 3**, alone. **End-to-end port:** `E2E_PORT=3101`. Read [README.md](README.md) first (shared rules). Unlike the other briefs, you may edit `package.json`, `package-lock.json` and `supabase/**`, but you do **not** run anything against the live database: the orchestrator applies the SQL.

> Orchestrator: refresh this brief after Wave 2 merges.

**Changes (SIMPLIFY.md):** C22–C27, plus whatever is left of C3 (AI) and C13 (Practice mode).

## Tasks
1. **Unused database tables and columns (C23):** write one dated clean-up script `supabase/cleanup-2026-10.sql` that drops what no code uses: tables `reminder_log`, `expenses`, `recurring_expenses`, `day_closes`, `share_links` (unless Wave 4 is planned; ask the orchestrator), `treatment_items` and the `expense-receipts` storage bucket and its policies; columns `visits.summary`, `notes_original`, `confirmed_at`, `patients.preferred_times`, `patients.is_test`, `patients.date_of_birth` and `booking_requests.date_of_birth` (age now lives in `birth_year`), `booking_requests.area`, `city`, `preferred_date`, `preferred_time`, `is_emergency`, `is_test`, `appointments.reminder_sent_at`, `visit_charges.treatment_item_id`, `payments.kind`, `payments.reference`. Recreate `submit_booking_request` and `confirm_booking_request` without the dropped columns (keep their rules and messages). Search `src/` first and keep anything still used. Keep `app_config`.
2. **One schema file (C24):** `supabase/schema.sql` = the whole database after the clean-up, runnable on an empty project. Delete the layered files (`phase2.sql`, `phase3-5.sql`, `patch-*.sql`), `archive-old-clinic-os.sql`; keep `reset-all-data.sql` until go-live. Update `supabase/tests/booking.check.mjs` to build from `schema.sql` and keep every check passing.
3. **Dead code (C25):** row types for removed tables (`src/lib/data/types.ts`), unused exports and parameters, the second copy of the photo bucket name, stale comments, anything left of the AI tidy-up or Practice mode; remove `@google/genai` and `@anthropic-ai/sdk` from `package.json` (`npm uninstall`); delete `public/images/dr_rahil_action.jpg` and `dr_rahil_portrait.jpg` (unused duplicates) after checking nothing references them.
4. **Fewer database calls (C27):** money owed read with one summed query; no full visit reload after every charge or payment.
5. **Docs (C26):** rewrite PRODUCT.md "Screens and flow" for the six screens; cut BUILD_PLAN.md down to status and what is left; fix README (no expenses promise) and `.env.example` (no AI keys); point AGENTS.md at the current docs.

## Check
A fresh database built from `schema.sql` passes `booking.check.mjs`; all four end-to-end files pass; a search of `src/` finds no use of anything removed. The orchestrator then applies the clean-up script live and does every daily job once on the phone.
