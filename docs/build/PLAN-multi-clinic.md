# Multi-clinic Clinic OS (step 2 of the business plan)

The owner's plan (30 Oct 2026): paid websites for many dentists, each with booking wired into Clinic OS, which
stays the owner's product. The basic features are the same for every clinic; hardware integrations are per clinic.
Memory: `business-model`. Hosting stays free while testing: Clinic OS at https://smile-dental-hin3.vercel.app,
Supabase Free.

## The model
- **A clinic is the unit, not a login.**
    - `clinics` holds one row per clinic, with a public `slug` the website's booking uses.
    - `clinic_members` lists who works there, with a role: owner, dentist or assistant. Visiting specialists may
      later belong to several clinics.
- **Clinic data carries `clinic_id`.** That covers patients, visits, photos, charges, payments, links,
  appointments, time off, requests, recordings, Tally, costs, stock, materials and the price list.
- **Personal data stays per person:** phone subscriptions, notification settings and log, error reports, and the
  access log.
- **Never a copy of the code per clinic.** A difference between clinics is a setting, a feature switch or an
  integration adapter.

## Slices (each tested, applied live and pushed before the next; Rahil keeps working throughout)
1. **Foundation, additive** (`supabase/multi-clinic-1-2026-10.sql`):
    - `clinics`, `clinic_members`, and the helpers `my_clinic_id()` and `is_clinic_member()`.
    - Every existing login gets a clinic of its own; the one in `app_config` is Smile Dental Clinic.
    - `clinic_id` on the 17 clinic tables:
        - existing rows are filled from their owner with the tables' own triggers off, so no "bill changed"
          mark, no appointment re-check and no new updated_at;
        - new rows are filled by a trigger from their owner.
    - A clinic that has records can't be deleted; its records have to go first, on purpose.
    - The change file guards the live run. It undoes itself unless only the clinic changed.
    - Who sees what doesn't change.
2. **Access by clinic**, in two parts:
    - **2a, the database** (`supabase/multi-clinic-2-2026-10.sql`; the app needs no change):
        - the 17 tables' rules go by the row's clinic, and a new row names its maker; the cross-table checks
          compare clinics;
        - files: the clinic's folder or a member's; request voice notes by the request's clinic;
        - by clinic too: confirming a request, loading the price list (and the list the website reads), and a
          charge's materials;
        - **chairs and dentists** (owner: "more than one dentist and more than one chair that can be occupied at
          the same time"):
            - an appointment is in a chair, with a dentist (a visiting specialist needs no login);
            - a chair, a dentist and a patient each have one booked appointment at a time;
            - time off is a dentist's, or the whole clinic's (everything until now is the whole clinic's);
            - each clinic starts with Chair 1 and its owner as dentist;
            - an appointment that names neither gets the booking person's dentist and the first free chair, and a
              moved one changes chair if its own is taken;
        - clinic keys beside the per-person ones (Tally settings, materials, stock names, price-list options);
        - `clinic_id` is required; a login with records can't be deleted (it deleted them); the clinic is
          filled in first (trigger `0_fill_clinic`, since a table's triggers fire in name order);
        - the change file's guard: each login sees exactly what it saw, row for row and file for file, or
          nothing changes.
    - **2b, the app:** uploads go to the clinic's folder, upserts use the clinic keys, and then the
      per-person keys go.
    - **Survey (30 Oct; paused for the website's AI readiness):**
        - **Rules:**
            - The 17 "Owner full access" policies become `clinic_id = (select public.my_clinic_id())`.
            - A restrictive insert policy keeps `owner_id = auth.uid()`, so a new row names its maker.
            - The cross-table checks compare `clinic_id`: visits → patients; photos, charges, payments, links
              and recordings → visits; appointments → patients and visits; requests → patients and
              appointments; stock moves and materials → stock items.
        - **Functions:**
            - `confirm_booking_request` finds the request, time off and patient by owner.
            - `replace_price_list` deletes and inserts by owner.
            - The voice-note storage policies go through the request's owner.
            - `set_booking_pause` (app_config) waits for slice 4.
        - **Storage:**
            - The `visit-photos`, `visit-audio` and `cost-bills` folders are `<uid>/…`, and the
              photo/recording checks require `storage_path like '<uid>/<visit>/%'`.
            - New uploads go to `<clinic_id>/…` (`PhotoGallery.tsx`, `smart-notes.ts`, `CostForm.tsx`).
            - Old folders stay readable by members of that login's clinic.
            - `delete-patient.ts` and `actions/visits.ts` list folders by path.
        - **One per person becomes one per clinic:**
            - Covers `tally_settings` (its key is `owner_id`; upserts in `actions/tally.ts` and `app/tally/file/route.ts`),
              `treatment_materials` (`actions/stock.ts`, `stock-import.ts`), `stock_items_owner_name` and
              `price_list (owner_id, treatment, detail)`.
            - Add the clinic key beside the old one, switch the app, then drop the old key, so no deploy
              breaks.
        - **Stay per person:** push subscriptions, notification settings, app errors, the access log, and
          `notification_log` (slice 4).
    - Storage: files under the clinic's folder (old paths still readable).
    - Cross-table checks (a visit's patient in the same clinic) use `clinic_id`.
3. **Settings from the database:**
    - `clinics` gets the details Clinic OS now reads from `src/config/site.ts`: name, phone, address, dentist,
      registration, signature, review link, UPI, Tally, chair monitor.
    - `getClinic()` replaces them in Clinic OS. The website keeps its own content.
4. **Public side per clinic:**
    - The booking functions and the price list take the clinic's slug, and the website passes its own.
    - Notifications loop over clinics. `app_config` retires.
    - Must come before slice 5. Until then, the website's free times (`get_open_slots`), its requests and the
      notifications find the clinic's rows through app_config's login. With a second person in the clinic,
      they would miss that person's appointments and time off.
5. **Sign-in by membership:**
    - Anyone who is a member may sign in, replacing `ALLOWED_EMAIL`; sign-ups stay off.
    - A set-up script makes the clinic, invites the dentist and fills the settings.
6. **Hours, closed days, holidays and message languages per clinic,** in the app and in SQL, with the test that
   keeps the two in step.
7. **Chairs and dentists in the app and on the website** (the database has them from slice 2a):
    - the clinic's settings list its chairs and dentists, including visiting specialists and the days they come;
    - booking picks the dentist (the person booking, by default), the calendar shows each chair, and time off
      can be one dentist's;
    - the website's free times count chairs and dentists: a time is free while a chair and a dentist are, and a
      patient may pick a specialist.

After that: the booking API v1 and component, the website template on Cloudflare Pages, integration adapters,
feature switches, and the admin console.
