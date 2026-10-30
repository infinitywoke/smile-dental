# Slice 3b: Clinic OS reads the clinic's details from the database

Part of `PLAN-multi-clinic.md` and `PLAN-endstate.md`. The database part is done and live:
`supabase/multi-clinic-3-2026-10.sql` and `supabase/multi-clinic-3b-2026-10.sql`.

## Goal
Everything Clinic OS writes for a clinic uses the **signed-in person's clinic** from the database, never
`siteConfig`. That covers patient WhatsApp messages, the typed prescription, the patient's link page, the UPI
code, the Tally file, the chair monitor and the app's own title.

`src/config/site.ts` stays Smile Dental's website content, and the website keeps reading it:
- `src/app/(home)/**`, `src/components/home/**` and `src/components/site/**`;
- `src/lib/agent-pages.ts` and `src/lib/structured-data.ts`;
- `src/app/sitemap.ts`, `public/robots.txt` and the root `src/app/layout.tsx` metadata;
- `src/lib/actions/booking.ts`.

**Hard rule:** no fallback to Smile Dental's details anywhere in Clinic OS. A clinic that is missing a detail
gets a clear error or a hidden feature, never another clinic's phone.

## What the database holds (snake_case)
- **`clinics`** (members read their own; one row for the signed-in person's clinic):
    - `id`, `slug`, `name`, `place`, `place_kn`, `phone`, `whatsapp`, `email`;
    - `address` (in full) and `short_address` (one line);
    - `maps_link` and `review_link`;
    - `upi_id` and `upi_payee`, and `logo` (a public path such as `/images/logo.jpg`);
    - `tally` (jsonb: `version`, `company`, `cashLedger`, `bankLedger`, `patientGroup`, `incomeLedger`);
    - `chair_monitor` (jsonb or null: `name`, `wifi`, `password`, `address`).
- **`dentists`:** `id`, `clinic_id`, `name`, `user_id` (null for a dentist with no login), `active`, `short_name`,
  `short_name_kn`, `qualifications`, `registration`, `signature` (a public path).
- **`shared_photos(token)`** (the patient's link page, called by anyone with the link):
    - a valid link also returns `clinic: { name, place, place_kn, phone, address, logo, dentist: { name,
      qualifications, registration, signature } }`;
    - an expired link returns `{ expired: true, clinic: { name, place, phone } }`;
    - an unknown token returns null.
- `getClinicId()` in `src/lib/auth.ts` already gives the signed-in person's clinic id.

## Build
1. **`src/lib/clinic.ts`** (pure, safe on the client): the types `Clinic`, `ClinicDentist` and
   `ClinicContext = { clinic: Clinic; dentist: ClinicDentist }`, in camelCase. Fields: `upi: { id, payee } | null`
   and `chairMonitor: {…} | null`.
2. **`src/lib/data/clinic.ts`** (`server-only`): `getClinic = cache(async (): Promise<ClinicContext>)`.
    - It reads the clinic row (the id from `getClinicId()`) and the dentist: the signed-in person's own row
      (`user_id` = `getDoctor().id`), else the clinic's first active dentist by `created_at`.
    - A missing name, phone, place, address or dentist throws `Error('This clinic isn't set up yet: <what>')`.
3. **`src/lib/test-clinic.ts`** (unit tests only):
    - `SMILE_DENTAL`: exactly the values in `supabase/multi-clinic-3-2026-10.sql`;
    - `OTHER_CLINIC`: invented values, for example "Bright Smile Dental", Manipal/ಮಣಿಪಾಲ, `+91 9000000001`,
      Dr. Kavya Shenoy, "Dr. Kavya"/"ಡಾ. ಕಾವ್ಯಾ", registration `12345-A`, its own address, links and UPI.
4. **`src/lib/whatsapp.ts`:** every clinic-to-patient builder and its helpers take the clinic context.
    - The builders: `messageSignOff`, `appointmentBlock`, `shortLocation`, `questionsLine`,
      `confirmationMessage`, `movedMessage`, `cancelledMessage`, `declineMessage`, `reminderMessage`,
      `missedMessage`, `runningLateMessage`, `recallMessage` and `reviewMessage`.
    - Every `siteConfig` read gives way to the context:
        - clinic name, and the sign-off place (`place`, or `place_kn` in Kannada);
        - phone, full address, short address, and the maps link (for Directions);
        - the review link, falling back to the maps link;
        - the dentist's full name (the sign-off) and short name ("Dr. Rahil is running late", and in Kannada).
    - Remove the module constants built from `siteConfig` (`CALL_US_KN`, `QUESTIONS_LINE`, `SHORT_ADDRESS`).
    - Move the website's messages (`bookingRequestMessage`, `clinicWhatsappLink`) to `src/lib/website-whatsapp.ts`
      (they may read `siteConfig`), and update their imports (`BookingCard`, the treatment page, and any others).
    - **For `SMILE_DENTAL`, every message stays byte-for-byte what it is today.** Existing tests change only by
      passing `SMILE_DENTAL`; an expected string is never changed.
5. **`src/lib/billing.ts`** (`visitMessage` and the like): take the clinic context, with the review link from it.
6. **`src/lib/upi.ts`:** the clinic's UPI (`{ id, payee }`) as a parameter. With none, the UPI code isn't
   offered.
7. **`src/lib/prescription-image.ts`:** take the clinic context: logo, signature, qualifications, the dentist's
   name and registration, and the clinic's name, phone and address.
8. **Pages and actions:** server pages and actions get the context with `getClinic()` and pass it down. Client
   components (`SendWhatsApp`, `RunningLate`, `ReviewRequest`, `PrescriptionCard`, `PaymentCard`, `MonitorPhoto`,
   `TallyPanel` and others) get what they need as serializable props.
9. **The patient's link page** (`src/app/r/[token]/page.tsx`, `src/components/SharedPrescription.tsx`) uses
   `shared_photos`' `clinic`. An unknown token gets a plain message with no clinic's phone in it. Its metadata
   title stops naming a clinic: "Your visit".
10. **Tally:**
    - `src/lib/data/tally.ts` defaults come from the clinic's `tally`;
    - `TallyPanel` gets the company, version and ledger hints as props;
    - `src/lib/tally-ledgers.ts` takes the patient group as a parameter;
    - `src/app/app/tally/file/route.ts` takes the company and clinic name from `getClinic()`.
11. **`MonitorPhoto`:** the chair monitor as a prop from the clinic. With none, there is no Monitor button.
    `next.config.ts`'s CSP keeps `siteConfig.chairMonitor.address` for now; leave it.
12. **Clinic OS's own name:**
    - `src/app/app/layout.tsx` metadata title is "Clinic OS";
    - `src/app/login/page.tsx` signs in to "Clinic OS", with no clinic's logo or name. Keep its layout, with a
      simple product heading.
13. **A guard test** (`src/lib/clinic-os-details.test.ts`):
    - It reads the Clinic OS source files and fails, naming each line, on any read of a clinic detail from
      `siteConfig` (`.name`, `.phone`, `.whatsapp`, `.email`, `.address`, `.dentist`, `.payments`, `.tally`,
      `.chairMonitor`, `.reviewRequestLink`, `.googleReviewsLink`, `.directionsLink`, `.media`).
    - The files: `src/app/app/**`, `src/app/r/**`, `src/app/login/**`, `src/components/clinic/**`,
      `src/components/SharedPrescription.tsx`, `src/lib/{whatsapp,billing,upi,prescription-image,tally-ledgers}.ts`,
      `src/lib/data/**`, and `src/lib/actions/**` except `booking.ts`.
    - `siteConfig.clinicOsUrl` and `siteConfig.url` are allowed: they are product addresses.
14. **New unit tests:** each clinic-to-patient message, built for `OTHER_CLINIC`, names that clinic, its place,
    phone and dentist, and contains none of "Smile Dental", "6361816711", "Rahil" or "Katapadi". Likewise the
    prescription, the UPI code and the Tally file name.

## Rules
- **Stay in `src/` and `e2e/`.** Don't touch `supabase/`, `docs/`, `public/robots.txt` or `next.config.ts`
  (beyond nothing).
- **Match the code around you:**
    - comments are plain English explaining why, about as dense as the surrounding code;
    - names read like the existing ones;
    - no new dependencies.
- **Gates, all of which must pass:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint` and `npx next build`, run
  in `D:\AG Projects\New Smile\smile-dental-website`.
- **Don't run Playwright:** it runs against the live database, and the orchestrator runs it.
- **Don't commit.**
- **Report:**
    - every file changed or added;
    - any decision the spec didn't settle;
    - the gates' summary lines;
    - anything you found that the orchestrator should check.
