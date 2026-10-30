# Slice 4, the app part: the website names its clinic, and notifications reach every member

Part of `PLAN-multi-clinic.md`. The database part is live (`supabase/multi-clinic-4-2026-10.sql`). Build on
slice 3b's app part, which is merged first: it adds `getClinic()` (`src/lib/data/clinic.ts`), whose
`clinic.slug` is the signed-in person's clinic.

## What the database offers now
- **The website** calls by name (PostgREST named arguments):
    - `get_open_slots({ p_clinic, p_from, p_days })`;
    - `booking_paused_until({ p_clinic })`;
    - `submit_booking_request({ p_clinic, p_name, p_phone, p_address, p_medical_alerts, p_heard_from, p_reason,
      p_notes, p_requested_start, p_gender, p_birth_year })`;
    - `public_price_list({ p_clinic })`.
- **The versions without `p_clinic`** still work, for Smile Dental Clinic only, and go once this is live.
- **Notifications:**
    - `notify_new_request_all({ p_secret, p_request })` and `notify_due_all({ p_secret })` return an **array** of
      the payloads `notify_new_request`/`notify_due` returned one of: `{ settings, subscriptions, items }`, one
      for each member of the clinic with a phone set up, or null when there is nothing;
    - `notify_gone` is unchanged.

## Build
1. **`src/config/site.ts`:** add `clinicSlug: "smile-dental-katapadi"` to `siteConfig` (`[VERIFIED]`, Smile Dental
   Clinic's slug in Clinic OS), with a one-line comment.
2. **The website's booking** (`src/lib/actions/booking.ts` and whoever calls it): every RPC passes
   `p_clinic: siteConfig.clinicSlug`.
    - `getBookingPause` takes the slug as a parameter: the website passes `siteConfig.clinicSlug`, and Clinic OS
      (Today, and anywhere else that shows the pause) passes `(await getClinic()).clinic.slug`.
3. **The price list** (`src/lib/data/price-list.ts`): `getTreatments(slug: string)` calls
   `public_price_list({ p_clinic: slug })`.
    - It stays `'use cache'`, with the slug as its argument, so each clinic is cached on its own, under the same
      `PRICE_LIST_TAG`.
    - It falls back to the list in the app (`treatments` in `site.ts`) **only for `siteConfig.clinicSlug`**, Smile
      Dental's own website content; any other clinic with no list loaded gets `[]`.
    - Every caller passes a slug:
        - website code (pages under `src/app/(home)/**`, `sitemap.ts`, `llms` routes, `src/app/md/**`,
          `structured-data` callers) passes `siteConfig.clinicSlug`;
        - Clinic OS code (visit page, stock, smart notes, materials, the stock import, Today, and so on) passes
          `(await getClinic()).clinic.slug`.
    - Keep `updateTag(PRICE_LIST_TAG)` where a sheet is loaded.
4. **Notifications** (`src/lib/push.ts`): use `notify_new_request_all` and `notify_due_all`, and deliver each
   payload in the array. `sent` totals them, and gone phones are gathered across all of them before one
   `notify_gone`. Adjust `src/lib/notifications.ts` types if needed. A notification must still never break a
   booking (keep the try/catch).
5. **Tests:**
    - unit tests for the price-list fallback rule (Smile Dental's slug falls back, another slug gets `[]`);
    - unit tests for delivering several payloads, if `push.ts` has testable parts (follow how `notifications.ts`
      is tested);
    - update existing tests for the changed signatures.

## Rules
- Work only in `src/` and `e2e/` (update e2e only where a moved signature breaks it). Don't touch `supabase/`,
  `docs/`, `next.config.ts` or `public/`.
- Match the surrounding code: plain-English comments on why, existing naming, no new dependencies.
- **Gates, all of which must pass**, run in `D:\AG Projects\New Smile\smile-dental-website`: `npx vitest run`,
  `npx tsc --noEmit`, `npx eslint` and `npx next build`.
- Don't run Playwright (the orchestrator does), and don't commit.
- **Report:** the files changed, any decision the spec didn't settle, the gates' summary lines, and what to
  double-check.
