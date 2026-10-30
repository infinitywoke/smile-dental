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
2. **Access by clinic:**
    - Every "Owner" policy becomes "members of the row's clinic", and `clinic_id` becomes NOT NULL.
    - A record outlives the login that made it. Today, deleting a login deletes every row it owns
      (`owner_id … on delete cascade`). Once several people work in a clinic, that has to stop.
    - The clinic-filling trigger must fire before any check that reads `clinic_id`. Postgres fires a table's
      triggers in name order.
    - Storage: files under the clinic's folder (old paths still readable).
    - Cross-table checks (a visit's patient in the same clinic) use `clinic_id`.
3. **Settings from the database:**
    - `clinics` gets the details Clinic OS now reads from `src/config/site.ts`: name, phone, address, dentist,
      registration, signature, review link, UPI, Tally, chair monitor.
    - `getClinic()` replaces them in Clinic OS. The website keeps its own content.
4. **Public side per clinic:**
    - The booking functions and the price list take the clinic's slug, and the website passes its own.
    - Notifications loop over clinics. `app_config` retires.
5. **Sign-in by membership:**
    - Anyone who is a member may sign in, replacing `ALLOWED_EMAIL`; sign-ups stay off.
    - A set-up script makes the clinic, invites the dentist and fills the settings.
6. **Hours, closed days, holidays and message languages per clinic,** in the app and in SQL, with the test that
   keeps the two in step.

After that: the booking API v1 and component, the website template on Cloudflare Pages, integration adapters,
feature switches, and the admin console.
