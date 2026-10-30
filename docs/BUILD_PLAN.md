# Clinic OS: build plan (status and what is left)

The *what* and *why* are in [PRODUCT.md](PRODUCT.md); coding rules are in [../AGENTS.md](../AGENTS.md). The simplification build that produced the current app is planned in [SIMPLIFY.md](SIMPLIFY.md) and logged in [BUILD_LOG.md](BUILD_LOG.md). Status as of **2026-10-12**.

## 1. Where we are

| Area | State |
|---|---|
| **Website** | Live. Online booking: the visitor picks a free 40-minute time and sends phone, name, gender, age and a reason. |
| **Hosting** | Vercel (`smile-dental-hin3.vercel.app`), auto-deploys `main` from the private GitHub repo `infinitywoke/smile-dental`. |
| **Auth** | Supabase email + password, for members of a clinic (`clinic_members`); sign-ups disabled; the session lasts until Sign out. |
| **Clinic OS** | Six screens: Today, Patients, New patient, Patient, Visit, Pick a time (see PRODUCT.md, "Screens and flow"). Visit page saves by itself; one WhatsApp message with the bill, next visit and prescription link. |
| **Database** | One file, `supabase/schema.sql`. The live project reaches the same state by running `supabase/cleanup-2026-10.sql` once. `supabase/reset-all-data.sql` erases trial data once before go-live and is deleted afterwards. |
| **Checks** | `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e` (four spec files, test login), `supabase/tests/booking.check.mjs` (PGlite), and the evidence tour in `tour/`. None use AI quota. |

## 2. What is left

1. **Go-live (orchestrator, see BUILD_LOG.md):** merge, push, wait for the Vercel deploy, apply `cleanup-2026-10.sql` straight away, run the checks against the live database, run `reset-all-data.sql` once, empty the `visit-photos` bucket, then delete `reset-all-data.sql`.
2. **Owner on the OnePlus 13:** one daily job of each kind (book from the website and confirm, walk-in, visit with a photo and a bill, payment by cash and by UPI, send on WhatsApp).
3. **Optional, later:**
   - a short prescription link (`/r/<token>`) using the kept `share_links` table;
   - expenses and daily close, recalls and reminders, insights (ideas in PRODUCT.md, removed from the app on purpose; the database tables were dropped in the clean-up);
   - a paid-tier AI key if tidy-up of notes is ever wanted again (the code is in git history).
4. **Known small things:** the money-owed list reads every charge and payment (two light queries, fine for now); the Visit page re-reads the visit and its bill after each charge or payment.

## 3. Data (see `supabase/schema.sql`)

`patients`, `visits`, `visit_photos`, `visit_charges`, `payments`, `appointments`, `time_off`, `booking_requests`, `share_links`, `app_config`. Every table has `owner_id` and row-level security ("Owner full access"); `anon` can only call `get_open_slots()` and `submit_booking_request()`. Money is `numeric(10,2)` rupees. Clinic hours and booking rules live in `clinic_slots()` / `get_open_slots()` and are mirrored in `src/lib/schedule.ts`.
