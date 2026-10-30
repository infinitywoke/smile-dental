# Clinic OS: the end state, and the sprint to reach it

Written 30 Oct 2026 for the owner's go-ahead. The slices' detail stays in `PLAN-multi-clinic.md`, and progress
goes in `../BUILD_LOG.md`.

## Where things stand

- **Live:**
    - multi-clinic slices 1, 2a and 2b: clinics and members, rules by clinic, chairs and dentists, files by
      clinic;
    - Alerts;
    - the website ready for AI agents.
- **Started:** slice 3a, the clinic's and dentists' details in the database. It is written and checked (9 tests),
  but not applied live.
- **Nothing for Rahil to notice:** his clinic has one person, one chair and one dentist, so every change so far
  behaves as before.

## The end state

### Phase 1: Clinic OS ready for clinic no. 2 (this codebase, the current free hosting)

Every clinic has:
1. **Its own data, files and rules.** Done (slices 1–2).
2. **Its own details wherever Clinic OS speaks for it:**
    - covered: WhatsApp messages (English and Kannada), the typed prescription, the patient's link page, the
      UPI code, the Tally file, the chair monitor, the app's title;
    - no fallback to Smile Dental's details anywhere (slice 3).
3. **Its own public booking**, through its slug:
    - covered: free times, requests, the price list and the booking pause;
    - notifications go out per clinic, and `app_config` retires (slice 4).
4. **Its own hours, closed days, holidays and message languages,** with the app and the database kept in step by
   a test (slice 6).
5. **Chairs and dentists in the app** (slice 7):
    - a Clinic settings screen for details, chairs and dentists, including visiting specialists and their days;
    - booking picks the dentist, defaulting to the person booking;
    - Today shows each chair, and time off can be one dentist's;
    - the website's free times count free chairs and dentists.
6. **Invite-only sign-in by membership** (owner, dentist, assistant):
    - the per-person keys go (slice 2c);
    - a set-up script onboards a clinic in one command (slice 5).

**Done when:**
- a second clinic is set up with one command;
- its dentist signs in, books, treats, bills, and sends WhatsApp messages and the Tally file, all with its own
  details;
- neither clinic can see the other's records or files, and tests prove it;
- Rahil's app works the same throughout.

### Phase 2: the product around it

7. **Booking API v1:**
    - per clinic slug: free times, a request, the price list;
    - rate-limited, versioned, and documented (OpenAPI);
    - what any clinic's website calls.
8. **Website template:**
    - Rahil's site becomes a template driven by each client's content and slug, deployed per client on
      Cloudflare Pages (commercial use allowed there, unlike Vercel Hobby);
    - Rahil's domain moves to it, and the Vercel project serves Clinic OS only.
9. **Operator console:** clinics, members, health, and onboarding on a screen.
10. **Integrations per clinic behind switches:** Tally, Intellicam, and the next clinic's hardware.
11. **Clinic OS on its own product address,** once the name and domain are picked; Rahil reinstalls the app once.

## How the sprint runs

### Every slice goes through the same gates
1. **Spec:** what changes, the guard, and the tests that prove it (in `PLAN-multi-clinic.md`).
2. **Database:** a change file with a guard that undoes everything unless it changed only what it should, plus
   PGlite checks (the change twice on a copy of the live schema with data, the rules for each role, and the guard
   tripping).
3. **App:** the code; then unit tests, tsc, lint and a production build.
4. **Live database:** the guarded change applied, then read-only checks.
5. **Whole browser suite** against the live database, as the test account (about 13 minutes).
6. **Push:** then confirm the deploy is live and every address answers.
7. **Records:** the build log and plan ticked, and the work committed.

### Who does what
| Work | Model | Why |
|---|---|---|
| Change files, row rules, guards, PGlite checks, sign-in and other security work, live applies, final review, merging | Opus (the orchestrator) | Mistakes here leak or lose patient data |
| App changes from a written spec: threading the clinic's details through, screens, website changes, browser tests | Sonnet builders, one at a time in the main tree | Clear specs and lots of code |
| Mechanical sweeps: finding call sites, renames, test fixtures | Haiku | Cheap and simple |
| A second look at each slice's diff before it goes live | A Sonnet reviewer | Fresh eyes on what the builder wrote |

- Builders work in `src/` and `e2e/` while I write the next slice's database part in `supabase/` and `docs/`, so
  our edits never collide.
- The browser suite runs one at a time, by me: there is one live test account.

### Order, and why
1. **3b, the app reads the clinic's details:** everything after it builds on per-clinic details.
2. **4, public side per clinic:** must come before anyone else signs in.
3. **6, hours and languages per clinic:** the website's free times need them.
4. **7, chairs and dentists in the app and website:** builds on 4 and 6.
5. **2c, the per-person keys go.**
6. **5, sign-in by membership and the set-up script:** last, as the switch that lets clinic no. 2 in.
7. **Phase 2:** the booking API, then the website template, operator console, integrations and product address.

### One continuous sprint
- No stops between slices: a short progress line at each gate, and the build log updated after every slice, so
  any interruption (session, usage) resumes exactly there.
- It stops only for:
    - a guard refusing a live change;
    - a decision only the owner can make;
    - an account step only the owner can do (Cloudflare, a domain).
- **Size:** each Phase 1 slice is medium, except 7 (large) and 2c (small). The whole sprint is large and may run
  past one session's usage; the build log carries it over.

## The owner's decisions (30 Oct 2026)

1. **Live changes:** approved. Each slice's guarded change is applied live, and pushed, once its gates pass, with
   a permission rule so auto mode lets the change command through.
2. **Scope:** Phase 1, plus the code of Phase 2.
    - The purpose is to show prospective clinics what the package can do: the website, the appointment
      interface and Clinic OS, priced with a monthly usage fee.
    - So the sprint also builds a **demo clinic**:
        - a fictional clinic with invented patients and data (never Rahil's);
        - its own website from the template, booking into its own Clinic OS;
        - its own login, to show prospects.
3. **Message languages:** English, Kannada and Hindi. Hindi needs a native speaker's check before patients see it.
4. **Visiting specialists** are booked by the clinic, not chosen by patients (at Smile Dental). The rule differs
   between clinics, so it is a clinic setting, decided at set-up.
    - Set-up is the owner's visit to a clinic: photos for its website, its data (stock and the like), its settings.
    - Default: patients don't pick a dentist.
5. **One patient at a time per dentist**, as now, but a dentist may deliberately run two chairs at once.
    - The overlap is refused first, saying who the dentist already has.
    - Booking it anyway needs an explicit "yes, two chairs at once".
    - The appointment is marked so; a chair, and a patient, stay one at a time always.

## Decisions before starting (asked 30 Oct; answered above)
1. **Live changes:** each slice's guarded database change is applied live, and pushed to `main`, once its gates
   pass, without asking each time. Auto mode stops at production changes, so a permission rule is needed for
   `npx supabase db query --linked … --file supabase/*.sql`.
2. **Scope:** Phase 1 only, or Phase 1 and the code of Phase 2. Phase 2's last steps need Cloudflare Pages access
   and, later, a product domain.
3. **Message languages:** English and Kannada for now, or more. Others need a native speaker to check them before
   patients see them.
4. **Rahil's new screen** (slice 7): Clinic settings lists his dentists, his 7 visiting specialists included, for
   booking only. No salary or commission.
5. **A dentist books one patient at a time** (as now), or may run two chairs at once, as some do while
   anaesthesia takes effect.
