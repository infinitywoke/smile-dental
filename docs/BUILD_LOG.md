
# Build log: the simplification build

Started 11 Oct 2026. The plan is [SIMPLIFY.md](SIMPLIFY.md) (fresh-eyes review). This file records **everything built under it**, so the build can be resumed at any point, by anyone, in a new session.

## How to resume (owner)
1. Open Claude Code in this folder. Choose **Opus 5.5** (`/model opus`) and **max effort** (`/effort max`).
2. Say: **"Resume the build from docs/BUILD_LOG.md."**
3. The orchestrator reads this file, [SIMPLIFY.md](SIMPLIFY.md) and [AGENTS.md](../AGENTS.md), checks `git status` and `git log`, and carries on from the first unticked step under **Progress**.

## How to resume (orchestrator)
- The next step is the **first unticked box** under Progress. Read the latest **Log** entries first: they say what was in flight.
- Builders work from the briefs in [docs/build/](build/). Re-run a builder by giving it its brief file (Agent tool, `isolation: "worktree"`, model and effort as in the table below). If a builder's worktree branch already exists (`git branch --list "worktree-*"`), review and merge it rather than starting over.
- Gates before any merge to `main` (all free, no AI): `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e` (the four spec files), and for the waves that change screens, the evidence tour (below).
- Database changes: write a dated SQL file in `supabase/`, check it with PGlite (`supabase/tests/booking.check.mjs`, run from a scratch folder that has `@electric-sql/pglite`), then apply it live with
  `npx supabase db query --linked --project-ref pmuecirfwmtsvojxleoq --file supabase/<file>.sql`
  (the CLI is signed in on the owner's PC). Record it in the log.
- After each step: tick it here, add a Log line (date, what, result, commit), commit this file with the work.

## Architecture (owner-approved, 11 Oct 2026)

| Agent | Model, effort | Job |
|---|---|---|
| Orchestrator | Opus 5.5, max (the main session) | Wave 0 set-up, briefs, merges, every check, database changes, this log |
| Builder 1A (visit page) | Opus 5.5, high | Hardest piece: one visit page that saves by itself |
| Builders 1B, 2A, 2B, 3 | Sonnet 5.5, medium | Time pickers; Today and patients; website form; clean-up |
| Fresh-eyes reviewer | Opus 5.5, high, once per wave | Looks at the new screens and the diff as a first-time user before the merge |

Rules: at most two builders at a time, each in its own worktree, never editing the same file (owners listed in each brief). The app is not in daily use yet, so each wave merges straight to `main` once the gates pass; the owner then checks it on the OnePlus 13.

## Decisions (owner, 11 Oct 2026): all five "yes"
- **D1** One visit page instead of the Notes / Bill / Send tabs.
- **D2** "Tidy up with AI" removed for launch (code stays in git history).
- **D3** Age instead of date of birth, in the app and on the website (stored as birth year).
- **D4** Practice mode, "Delete test data" and TEST badges removed; trial data erased once at go-live with `supabase/reset-all-data.sql`.
- **D5** Shorter website booking: no review page; only phone, name, gender and reason required.

## Evidence tour
A scripted walk through every daily job on a OnePlus 13-sized screen, recording screenshots, taps, typing, 48 dp misses and Back-gesture results. Files: `tour/tour.spec.ts`, `tour/playwright.config.ts`; output in `tour/out/` (git-ignored). Run against a production build signed in as the test account:
```
npm run build
ALLOWED_EMAIL=<TEST_EMAIL from .env.test.local> npx next start -p 3100   (leave running)
npx playwright test -c tour/playwright.config.ts
```
Baseline (11 Oct, before any change): walk-in 15 taps, 10 typed, 1 date picker, 5 screens; 4 Back-gesture failures; 54 Clinic OS controls under 48 dp; "Tidy up" hung over 75 s. The tour's selectors follow the screens, so update it when a wave changes them.

## Progress

### Wave 0: prepare (orchestrator)
- [x] Fresh-eyes review written: `docs/SIMPLIFY.md`
- [x] Owner decisions D1–D5 recorded (here and in PRODUCT.md)
- [x] Old agent worktrees and their branches removed (all four were merged and clean)
- [x] Database: birth year added (`supabase/patch-age.sql`), checked with PGlite (115 checks), applied live
- [x] End-to-end tests split into `e2e/visit.spec.ts`, `times.spec.ts`, `today.spec.ts`, `website.spec.ts`, with a shared `e2e/helpers.ts` (each run cleans only its own data through the API, so two builders can test at once; no Practice mode needed); OnePlus 13 screen profile; `E2E_PORT` lets each builder use its own port
- [x] Evidence tour moved into the repo (`tour/`)
- [x] Briefs written: `docs/build/README.md` (shared rules), `1A-visit.md`, `1B-times.md`, `2A-today-patients.md`, `2B-website.md`, `3-cleanup.md` (2A and 3 to be refreshed after the wave before them)
- [x] Gates pass on the unchanged app (tsc, 203 unit, lint, build, 13 e2e); `main` fast-forwarded and pushed (the base for Wave 1 worktrees); work continues on `main`

### Wave 1: visit page and time pickers (two builders in parallel)
- [x] 1A Visit page (Opus, high): C1, C3, C4, C6, C7, C16 + visit parts of C5, C15, C17, C18 (commits 3ca78a8 + 2a32bc5, merged as e493be5)
- [x] 1B Time pickers and bookings (Sonnet, medium): C2, C14 + parts of C10, C17, C18, C21, C22 (commit 4daa19e, merged as cff4247)
- [x] Merged, gates pass, tour re-run, fresh-eyes review (`docs/build/review-wave1.md`: 1 blocker, 5 should-fix, 9 nice-to-have, security none), pushed
- [x] 1C Fixes from the review (Opus, high, `docs/build/1C-visit-fixes.md`, port 3101), in parallel with 2A (commit eb1ce42, merged as 6f05328)
- [ ] Owner phone check on the OnePlus 13 (after 1C)

### Wave 2: Today, patients and the website form (two builders in parallel)
- [x] 2A Today, navigation and patients (Sonnet, medium): C8, C9, C11, C12, C13 + parts of C5, C10, C15, C18, C21 (commit 45e8fc8, merged as f43e427)
- [x] 2B Website booking (Sonnet, medium): C19 + website side of D3 (commit ed491af, merged as 5fbef0a)
- [x] Merged, gates pass, tour re-run, pushed; fresh-eyes review (`docs/build/review-wave2.md`: no blocker, 6 should-fix, 5 nice-to-have, security none)
- [x] 2C Clinic OS fixes from the review (Opus, high, `docs/build/2C-clinic-fixes.md`, port 3101; commit f21b2ee, merged as a6f3240) and 2D website fixes (Sonnet, medium, `docs/build/2D-website-fixes.md`, port 3102; commit c594600, merged as c31afbb); gates, tour, pushed
- [ ] Owner phone check on the OnePlus 13

### Wave 3: clean-up (one builder, orchestrator runs the database script)
- [x] Builder 3 (Sonnet, medium): C22–C27 and what is left of C3 and C13 (commit 8da79dd, merged; orchestrator patch fc80dc7)
- [x] Database clean-up script checked with PGlite and applied live (owner's OK, 2026-10-12)
- [ ] Gates pass, pushed; owner does every daily job once on the phone

### Wave 4 (optional): short prescription link (C20)
- [ ] Owner creates a server-only Supabase secret key and adds it in Vercel
- [ ] Built, checked, pushed

#### Next plan (15 Oct)
- [x] Go-ahead given (15 Oct). Change: on-phone Whisper won't run well on Dr. Rahil's **Poco M2 Pro** (2020, Snapdragon 720G), so step 8 sends the recording to Gemini's free tier (transcribe + sort in one call; he doesn't say names) or uses Gboard voice typing + Gemini for text; owner chooses at step 8. Design for the Poco too (older, slower phone).
- [x] 1. Backups: `.github/workflows/backup.yml` (nightly 2 AM IST: pg_dump public/auth/storage + CSVs, restored into a scratch Postgres and row-counted, then rclone crypt → owner's Google Drive; photos mirrored; 30 daily + 12 monthly), `scripts/backup/restore-stubs.sql`, `docs/BACKUPS.md`. [x] Owner added the 4 secrets; first manual run green on 15 Oct (fixes on the way: no brackets/special characters in the DB password, encoded rclone token unwrapped, missing folders skipped when pruning, checkout@v5). Note for owners: "Re-run jobs" repeats an old version; use "Run workflow".
- [x] 2. Delete patient: patient page → "Delete patient" (bottom) → `/app/patients/[id]/delete` lists what goes, password re-checked on the server (separate sign-in, signed out at once); with payments: "keep ₹X in the books" (details, notes, photos, requests erased; record renamed "Deleted patient (date)"; money kept) or "delete everything"; photo files first; offers the cancellation WhatsApp for a coming appointment. `e2e/patients.spec.ts`. Gates: tsc, 162 unit, lint, build, e2e 41 passed + 2 time-of-day skips.
- [x] 3. Undo and Remove: one Undo bar on the visit page (`UndoBar.tsx`, 8 s, then gone) after booking a next visit, adding a charge, recording a payment and removing a next visit; "Remove" next to "Change" (`removeNextVisit`; offers the cancellation WhatsApp if the visit was already sent). `e2e/undo.spec.ts`. Gates: tsc, 162 unit, lint, build, e2e 44 passed + 2 time-of-day skips.
- [x] 4. Website: green note before the button ("Next, WhatsApp opens with your request already written. Just tap Send…"), button "Confirm & send WhatsApp message"; "No WhatsApp? Ask the clinic to call you" saves a call-back request (note line `CALL_BACK_NOTE`, `src/lib/booking-contact.ts`) shown on Today's card with "📞 call to confirm" and a Call button; bot traps: hidden `website` field and a 3-second minimum on the details step (bots get a fake success, nothing saved), on top of the database limits. Google link: `https://smile-dental-hin3.vercel.app/book?utm_source=google&utm_medium=business_profile` (pre-fills "Google"; owner adds it in Business Profile → Edit profile → Appointment links). Gates: tsc, 164 unit, lint, build, e2e 44 passed + 2 skips.
- [x] 5. Holds after WhatsApp: `supabase/hold-after-whatsapp-2026-10.sql` (**applied live 15 Oct**, additive: `booking_requests.received_at`, `request_hold_until` = received + 2 h, never past the appointment, past closing → 10:30 AM next open day, Fridays skipped; `get_open_slots` hides only held requests), folded into `schema.sql` (PGlite: live+migration = schema, 0 differences; booking checks 109/109, logic 35/35). The patient's WhatsApp link is now `/app/requests/<id>/received` (route handler: signed-in tap records `received_at`, then opens the request; the patient's link preview isn't signed in). Today's card: "Not held yet" / "Held until 12:00 pm" / "No longer held" (`src/lib/request-hold.ts`, same rule as SQL; Decline only when stale). `e2e/requests.spec.ts`. Gates: tsc, 170 unit, lint, build, e2e 44 passed + 3 evening skips. Later: WhatsApp Business Platform webhook can set `received_at` automatically.
- [x] 6. Patient voice note test: each website visitor gets one version (sessionStorage `smile_voice_variant`, 50/50; browsers that can't record get WhatsApp): **page** = optional recorder after the reason ("Tell Dr. Rahil what's bothering you", prompts, up to 1 min, ~24 kbit/s, `VoiceNoteRecorder.tsx`) uploaded after the request (`attachVoiceNote`); **whatsapp** = guidance to send a WhatsApp voice note after Send, and the clinic's message says one is coming. `supabase/voice-notes-2026-10.sql` (**applied live 15 Oct**, additive: `voice_variant`, `voice_note`, private bucket `request-voice` 1 MB audio-only, upload only for a request under 15 minutes old without a note, `set_request_voice` once; folded into schema; booking checks 121/121). Today's card and the request page play the note (1-hour links) or say one was asked for on WhatsApp. Delete patient removes their voice notes; the nightly backup copies them; privacy page updated. **To compare after 2–3 weeks:** `select voice_variant, count(*), count(voice_note) from booking_requests group by 1`, plus Dr. Rahil's view of WhatsApp notes. `e2e/voice.spec.ts`. Gates: tsc, 170 unit, lint, build, e2e 47 passed + 3 evening skips.
- [x] 7. Appointment lengths: 20 / 40 / 60 / 80 / 120 min (`LENGTHS`, `startsFor`, `clinicStartOf`, `lengthLabel` in `schedule.ts`), Clinic OS starts on a 20-minute grid within the sessions (ending by 1:10 / 7:50 PM); `getDaySchedule(date, length)` keeps the familiar block starts and shows a between-blocks start only when it is free and the block start before it isn't (no doubled buttons). "How long?" chips (`LengthChips.tsx`) on the booking page (`?len=`), the request page (Save confirms that length) and the next visit (suggestion and picker fit the length; Undo keeps it); Move keeps the appointment's own length; ends shown with the real length (patient page, Today). Website unchanged (40-minute blocks). `supabase/appointment-lengths-2026-10.sql` (**applied live 15 Oct**: `is_clinic_start`, `confirm_booking_request(…, p_minutes default 40)`, old 3-argument version dropped; folded into schema; booking checks 132/132, logic 35/35 now built from schema only). `e2e/lengths.spec.ts`. Gates: tsc, 173 unit, lint, build, e2e 51 passed + 3 evening skips. Later: defaults by treatment and learning from his real visit times.
- [x] 8. Smart notes (owner chose "A: record, then Gemini"; owner approved Gemini suggesting charges by price-list item): `RecordNotes.tsx` replaces the dictation button (`MicButton`, `dictation.ts` deleted); `sortVisitNotes` (server action, 5 MB limit in `next.config.ts`) → `src/lib/smart-notes.ts` (exact instructions, JSON schema, every answer re-checked: unknown IDs and odd lengths dropped, text capped) → notes added below what was typed; `NoteSuggestions.tsx` card (charges at the clinic's price, ranges ask for the amount; next visit at the first free time that fits) with Undo. `GEMINI_API_KEY` in Vercel (owner); `GEMINI_FAKE=1` in the e2e server. Real check with a synthetic recording: correct notes, RCT 46 (P15), next visit 7 days / 60 min, 15.6 s. Privacy page updated. `e2e/smart-notes.spec.ts`. Gates: tsc, 168 unit, lint, build, e2e 52 passed + 3 evening skips.
  - 15 Oct follow-up: the clinic keeps each recording (private `visit-audio` bucket + `visit_recordings`, played under "Recordings (n)" on the visit; deleted with the visit/patient; backed up nightly). Gemini now writes best guesses marked (?), marks each charge sure/guess ("best guess: check" badge), lists treatments not on the price list (Rahil types the amount) and what it couldn't make out. Gemini keys rotate: GEMINI_API_KEY and GEMINI_API_KEY_1.._9 in Vercel; 6 fallback models, 40 s per try, 2 rounds. Gates: lint, 168 unit, build, 52 e2e (3 evening skips).
- [x] 9. Extras (15 Oct): typed prescription (`src/lib/prescription.ts`, `prescription-image.ts`, `PrescriptionCard.tsx`), tomorrow's reminders, "Didn't come" + call-back list, 6-month check-ups (`data/follow-ups.ts`, `actions/follow-ups.ts`, `FollowUps.tsx`; `supabase/reminders-recall-2026-10.sql` applied live, live = schema, PGlite 132/35). Tests: `e2e/prescription.spec.ts`, `e2e/follow-ups.spec.ts`; gates: lint, 172 unit, build, 57 e2e (3 evening skips). Owner: phone check on the Poco; Rahil to check the starter medicine doses; registration number for the letterhead.
- [x] 9b. Google review request (19 Oct): "Ask for a Google review" on a visit once its bill was sent on WhatsApp, the same words for every patient, once per patient, with Undo (`patients.review_asked_at`, `supabase/review-requests-2026-10.sql`, applied live). Uses the Maps link until the owner gives the "write a review" link (`siteConfig.reviewRequestLink`). WhatsApp "sent" marks now go by keepalive (`/app/marks`), so they survive WhatsApp opening in the same tab.
- [x] 10. Send to Tally (19 Oct): Money today card on Today, `/app/tally` (ledger names once, new payments only, download again, a whole month), Tally XML receipts (`src/lib/tally.ts`); `tally_settings` (`supabase/tally-2026-10.sql`, applied live, in backups). Tests: `src/lib/tally.test.ts`, `e2e/tally.spec.ts`; gates: lint, 176 unit, build, 61 e2e (2 evening skips). Owner/Rahil: real ledger names, test import in a backup company, each payment or daily totals. Rahil (20 Oct): Tally.ERP 9; ledgers Cash and Bank of Baroda (prefilled from `siteConfig.tally`); each payment. His income ledger sits under the Direct Incomes group; the screen refuses a Tally group name typed as a ledger.
- [x] 11. Website overhaul, step 0 (20 Oct): removed untrue or unverified claims (team, specialists, pain-free, best dentist, the typed-in 5.0 rating and quote). Sitemap, robots and business details now use the real address instead of `smiledental.test`. Photo shot list in `docs/website/SHOT-LIST.md`.
- [x] 13. This month (20 Oct): `/app/insights`, opened from Money today on Today.
    - Shows money collected (cash and UPI), owed to you now, visits, new patients and how they heard of the clinic, website bookings, Didn't come, and the most billed treatments.
    - Each number sits beside the same days of last month (a past month beside the whole month before); the arrows go to earlier months.
    - A part with nothing recorded doesn't show.
    - Send to Tally is at the bottom.
    - Code: pure maths in `src/lib/insights.ts` (unit-tested), data in `src/lib/data/insights.ts`; tests in `e2e/insights.spec.ts`.
- [x] 12. Website overhaul, phase 0 (21 Oct): the owner chose **D**, a combination: A's navy-and-amber colours and type (Instrument Serif headlines, Manrope text), B's crisp outlines and pressable buttons, and C's tooth chart. It was then made more professional, with booking first (design: board D on https://claude.ai/artifact/LeMtkwrePYruX3L65EdDX1).
    - **Built at `/preview`**, not linked and kept out of search (`robots: noindex`). The live homepage is unchanged until the owner and Rahil approve.
    - **Files:** `src/app/(home)/` (layout with the two fonts, `home.css` scoped under `.h-root`, `preview/page.tsx`) and `src/components/home/`.
    - **Header** (`SiteHeader.tsx`): one row on every screen, pinned to the top, solid once the page scrolls.
        - At 1280px and wider: glass buttons for treatments and prices, Dr. Rahil, Get directions, WhatsApp the clinic, a call icon, and an amber Book appointment button.
        - Narrower: call, Book and a menu.
        - On a phone: call and the menu. A bar at the bottom offers WhatsApp and Book, and steps aside while the booking card is on screen (`MobileBar.tsx`).
    - **The headline opens the page**, signed underneath by Dr. Rahil: his photo in a three-part amber ring with a "5 yrs" level badge, his name and a line on his training and practice. A full player card at the top was tried first and dropped the same day: opening the page with it felt odd, and it competed with the headline and the booking card.
    - **Smarter top section:**
        - a live open or closed status in India time (`src/lib/clinic-hours.ts`, `OpenStatus.tsx`; for example "Closed for lunch · opens at 2:30 PM", with Friday skipped);
        - "How booking works" in 3 steps.
    - **Smarter booking card:**
        - an "Earliest: Today, 4:30 PM" shortcut;
        - "N free" on each day;
        - a line that fits the reason (its price; for toothache, the earliest time with "Take it");
        - "Coming in right now? Call the clinic" on today.
    - **Lower sections:** a Questions section (verified FAQs, opening in place) and the Google map in Visit. Sections ease in as they scroll, in CSS only (`animation-timeline: view()`), so nothing is ever hidden without it, nor in print.
    - **Search details** for when it becomes the homepage: Dentist with address, opening hours, map location and the dentist, plus an FAQ page.
    - **Booking card** (`BookingCard.tsx`):
        1. What do you need? (10 reasons, including Not sure).
        2. The next 6 days with free times, or Other date (that date's free times, or why there are none: past, Friday, beyond four weeks, full).
        3. A free time.
        4. Name and WhatsApp number.
    - **How it sends:** no gender is asked; `submitBookingRequest` now accepts a blank gender, and /book still asks for it. The request and WhatsApp flow are the same as /book, including "call me instead" and the bot traps.
    - **Another time:** "None of these work? Ask for another time" offers a 12-hour list of times within opening hours, 15 minutes apart, with past times hidden today, plus Any time or Any time in the morning, afternoon or evening. It opens WhatsApp with the request written; nothing is saved, and the clinic replies.
    - **Treatments and prices:** 8 rows from `homeServices` in `site.ts`. Each Book link picks that reason on the card (`book-events.ts` keeps a choice made while the card is still loading).
    - **Not sure? tooth chart:** all 32 teeth with dental numbers, plus areas (front, back, wisdom, gums, missing). It picks the reason and notes the tooth, for example "Toothache (tooth 36, lower left first molar)".
    - **Prices:** every homepage price is checked against the price list by `src/lib/home-content.test.ts`.
    - **Tests:** `src/lib/booking-days.test.ts` and `e2e/home-preview.spec.ts`. The e2e test never sends a request, because public requests go to the clinic's own account.
    - **Then:** the other pages in the same style (item 15), and the switch-over (item 16).
    - **Domain:** the owner is buying one (smiledentalkatapady .com/.in were free on 20 Oct); then switch `siteConfig.url` and the Google profile's appointment link.
- [x] 14. No notice needed for online booking (21 Oct, the owner asked): any free block that hasn't started can be requested, and today's times offer "Coming in right now? Call the clinic".
    - **Code (shipped):** `MIN_LEAD_MINUTES` is now 0 in `schedule.ts` (a block is bookable until it starts).
    - **Database:** `supabase/no-notice-2026-10.sql` replaces `get_open_slots`. The 2-hour line becomes `s.slot > clinic_now()`; the 2-hour hold after a WhatsApp is a different rule and stays.
    - **Checks:** booking 133/133 and logic 35/35. Live schema + this file = `schema.sql`, with no difference in columns or functions.
    - **Applied live by the owner (21 Oct).** Checked read-only: the live `get_open_slots` has the `s.slot > clinic_now()` rule and no 2-hour line.
- [x] 15. Website phase 0, the other pages (21 Oct): the rest of website D, also under `/preview` and out of search (`(home)/preview/layout.tsx` sets noindex for every page under it).
    - **One frame for every page** (`(home)/layout.tsx`): the header, the Visit section as the foot of every page (`SiteFooter.tsx`) and the phone bar. Links come from `src/components/home/site-links.ts`: `HOME` is `/preview` until the switch, and `linksFor(path)` sends Book to the card on the page (homepage, booking page) or to the booking page.
    - **Treatments and prices** (`/preview/treatments`): the whole price list under the homepage's 8 headings, with a Book button on each. Post and core now sits under root canal; a unit test checks every treatment is under exactly one heading. Prices read as the website says them (`priceForPatients`: "₹3,499 per crown").
    - **A treatment's page** (`/preview/treatments/[slug]`): its prices, Book (with its reason chosen), "Ask about it on WhatsApp", and the other treatments under the same heading.
    - **Booking page** (`/preview/book`): the same card. `?reason=` takes a reason, a treatment, or the treatment name older links carry (`src/lib/booking-reasons.ts`); `utm_source` still records where the visitor came from.
    - **The voice note test moved into the card** (`voice-variant.ts`, `useVoiceRecorder` in `VoiceNoteRecorder.tsx`, `VoiceNote.tsx`): the same 50/50 versions, wording and upload as /book, so the test keeps running after the switch.
    - **Privacy** (`/preview/privacy`): the same policy; the website part now describes the new card (name, WhatsApp number, time, reason, an optional voice note, and where the visitor came from).
    - About, Contact and FAQ are sections of the new homepage (Your dentist, Visit, Questions), so they get no pages of their own.
    - **Tests:** `e2e/site-preview.spec.ts`, plus 2 in `voice.spec.ts`. The preview tests wait for React (the open status shows) before tapping, because a tap before that is lost.
- [x] 16. Website switch-over (21 Oct, the owner: "switch the live site over now"): website D is the live site.
    - **Real addresses:** the pages moved from `(home)/preview/` to `/`, `/treatments`, `/treatments/[slug]`, `/book` and `/privacy`, open to search. `site-links.ts` no longer has the `/preview` base path.
    - **Deleted:** `(public)/` (the old homepage, about, contact, FAQ, book, privacy and treatments pages), `PublicHeader`, `TreatmentsCarousel`, `PublicBookingForm` and `e2e/website.spec.ts`. The recorder is now only `useVoiceRecorder`, in `src/components/site/voice-recorder.ts`.
    - **Redirects** (`next.config.ts`):
        - /about → /#doctor, /contact → /#visit and /faq → /#questions (permanent);
        - /preview and anything under it → the live pages.
    - **Sitemap:** /, /book, /treatments, /privacy and the 12 treatment pages.
    - **Google profile:** the appointment link (`/book?utm_source=google&utm_medium=business_profile`) opens the new booking page and still records "Google".
    - **Tests:**
        - `e2e/home.spec.ts`;
        - `e2e/site.spec.ts`, now with the redirects;
        - `e2e/voice.spec.ts`, now on /book;
        - the tour's website step uses the card.
- [x] 17. Booking card, one step at a time (21 Oct, the owner asked) (`BookingCard.tsx`, `home.css`):
    - **The steps:** 1 what you need, 2 a day, 3 a free time, 4 name and WhatsApp number. Only the step on show is visible, with a 4-part progress line and "Step N of 4".
    - **Moving on:** each answer moves on by itself after a short moment to see it chosen. The Earliest shortcut and "Take it" jump straight to the details.
    - **Going back:** the answers so far sit above the step, each with **Change**, and Back goes one step. A changed answer returns to the first step still unanswered, so changing the reason from the details comes straight back to the details with what was typed kept.
    - **Animation:** the new step slides in from the right going forward and from the left going back, while the card eases to its new height. It is off for anyone who turns motion off on their phone. Focus moves to the new step's title, and a card scrolled out of sight comes back into view.
    - **Everything else kept:** reason hints and prices, other dates (a closed date stays on the day step with the reason; too far or full moves on to ask for a time), "Ask for another time" (now with a Your name field), the voice-note test on the details step, the bot traps, and "call me instead".
    - **Links:** a Book link or the tooth chart moves the card from step 1 to the day. `/book?reason=` opens on step 2.
    - **Tests:** the booking tests in `e2e/home.spec.ts` now walk the steps, changing an answer and going back; `site.spec.ts` checks the answers list; `voice.spec.ts` walks to the details; the tour picks a day.
    - **Also fixed:** `e2e/lengths.spec.ts` "Move keeps the appointment its own length" failed in the evenings. The last time left today could be the appointment's own, where 80 minutes run past closing. The test now moves to 8:30 AM six open days ahead.
- Outside the repo (20 Oct):
    - Rahil meeting pack https://claude.ai/artifact/GJGMstZ5ucUZvkuiUmzdS7.
    - **90-second commercial** `../commercialisation/demo/clinic-os-commercial.mp4` (1080×1920, H.264 + AAC, 58 MB).
        - Gemini voice-over: one read, split into its lines, words checked by transcription.
        - The tour runs inside a phone with words on screen; the music and sound effects are synthesised in the browser.
        - Remake: `../commercialisation/demo/commercial-tools/README.md`.
    - **Silent demo** `../commercialisation/demo/clinic-os-demo.mp4`, from `demo-tour.spec.ts`, then re-cut.
        - The old `.webm` had grey padding: Playwright records at the page's CSS size inside the larger frame.
    - Both videos: production build, test account, made-up patients only.
    - Rahil's user guide rewritten for the current app: `../for-dr-rahil/Clinic-OS-User-Guide.pdf` (the old one is in `old-2026-10-10/`).
- Plan: `docs/build/PLAN-2026-10-next.md` (backups to Google Drive, delete patient, undo/remove, website wording + fallback + abuse guards, WhatsApp-verified holds, patient voice note test, appointment lengths, smart voice notes, extras). Waiting for the owner's go-ahead; built directly by the orchestrator, one item at a time, pushed after each.

#### Agent-ready, notifications, HUD, stock and costs (owner-approved 21 Oct) — **resume here**
The owner said "Go" on 21 Oct, with one change: **the 3-second anti-bot rule stays for now.** The orchestrator builds one phase at a time and pushes after each step.

Choices (the plan's recommendations, accepted):
- the order below;
- patient names off the lock screen by default;
- Supabase's scheduler (pg_cron) for timed notifications;
- stock starts with bills, counts, costs and monthly profit, and adds automatic use per treatment once Rahil lists his materials.

The multi-clinic foundation comes after this. New tables follow the existing owner pattern, so its migration covers them.

- [x] **P1. Agent-ready (21 Oct):**
    - **Machine-readable prices:** schema.org JSON-LD from one module, `src/lib/structured-data.ts`, built from the price list and rendered by `JsonLd.tsx` with "<" escaped.
        - Homepage: Dentist, with `@id`, price range ₹200–₹1,25,000, cash and UPI, hours, place and email.
        - `/treatments`: an OfferCatalog under the 8 headings, every option once.
        - Each treatment page: a Service with an Offer per option (fixed price, min–max range, or starting price with its rule in words).
        - Tests: `structured-data.test.ts` checks every amount against the price list; `e2e/site.spec.ts` reads it from the pages.
    - **Google profile sheet** (copy buttons, values exactly as on the site): https://claude.ai/artifact/SqhE9e6LoNz5wDwH8ncmHj. The owner or Rahil pastes it into the profile, then sends a screenshot to check. It notes that Google shows the name as "Smile Dental Clinic - Katapady"; the name should match the signboard.
    - The review link is skipped and the anti-bot rule is unchanged, as the owner asked.
- [x] **P2. Notifications on the installed Clinic OS (code shipped 21 Oct; waiting on the owner's setup below):**
    - **Phone:**
        - `public/sw.js` shows notifications and opens the right screen when one is tapped. It caches nothing and its scope is `/app/`, so the website is untouched.
        - Patients → **Notifications** (`/app/notifications`, `NotificationSettings.tsx`): Turn on for this phone, Send a test, Turn off.
        - Settings: a new request, a request still waiting, the morning brief, names on the lock screen (off by default), and quiet hours (default 9 PM to 8 AM).
    - **Database** (`supabase/notifications-2026-10.sql`, folded into `schema.sql`):
        - tables `push_subscriptions`, `notification_settings` and `notification_log` (each notification once);
        - functions `notify_new_request`, `notify_due` and `notify_gone`, guarded by a secret in Supabase Vault (`clinic_os_cron`), so no admin key goes to the app;
        - the live-only part enables pg_cron and pg_net, makes the secret inside the database, and schedules `clinic-os-notify` every 5 minutes to POST `/api/notify`.
    - **Server:**
        - `src/lib/push.ts` sends with web-push and forgets phones that are gone;
        - `src/lib/notifications.ts` holds the wording and quiet hours (unit-tested);
        - `/api/notify` checks the secret;
        - `submitBookingRequest` sends the new-request notification with `after()`, so a notification never slows or breaks a booking.
    - **What is sent:**
        - "New booking request · Tomorrow, 5:10 PM · Toothache";
        - "A request is still waiting" 30 minutes on, if WhatsApp hasn't arrived;
        - "Today at the clinic: 3 booked, first at 8:30 AM · 1 request waiting" at 8:15 AM, not on Fridays or blocked-off mornings.
        - The brief has no money owed yet: that waits until the money totals live in the database (HUD phase), so it always matches the screens.
    - **Checks:** `supabase/tests/notify.check.mjs` 31/31 (booking 133/133 and logic 35/35 still pass), unit tests for the wording, and `e2e/notifications.spec.ts`.
    - **Owner's setup, once:**
        1. Run `supabase/notifications-2026-10.sql` in the Supabase SQL editor.
        2. Run `select decrypted_secret from vault.decrypted_secrets where name = 'clinic_os_cron';` and add the value in Vercel as `CLINIC_OS_CRON_SECRET`.
        3. Run `npx web-push generate-vapid-keys` and add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Vercel.
        4. Redeploy.
        5. On Rahil's phone, in Clinic OS: Patients → Notifications → Turn on → Send a test.
- [x] **P3a. HUD design board (21 Oct), waiting for the owner's pick:** https://claude.ai/artifact/G9pvj8k1PDagP239oaVn9D, phone-size Today and Visit screens for each direction, with made-up patients.
    - **A · Cockpit:** dark navy with amber instruments (day ring, next patient, gauges, alerts, day timeline, controls). Manrope with JetBrains Mono readouts.
    - **B · Mission control:** dense tiles with status lights, an appointment ticker and an event log. IBM Plex Sans Condensed and Mono.
    - **C · Daylight:** light panels with the website's crisp outlines and offset shadows, readable in a bright surgery. Instrument Serif and Manrope.
    - Every direction has the new bottom bar (Today · Patients · + · Stock · Money) and the quick controls (block time, pause online booking, running late, walk-in).
- [x] **P3b, part 1 (21 Oct): the owner chose A · Cockpit, following the phone's light or dark mode, with a switch in Settings.**
    - **Theme for all of Clinic OS** (`globals.css`, `.hud`): the Tailwind colours the screens use are redefined for Cockpit light (mist, navy, amber) and dark (navy panels, amber primary, grays reversed), so every existing screen follows without being rewritten.
        - `data-theme` on `#hud-root` is the choice from the `clinic-theme` cookie (`src/lib/theme.ts`): `system` follows the phone through `prefers-color-scheme`.
        - Fonts: Manrope and JetBrains Mono (`hud-mono` for readouts). The status bar colour follows the theme (`ThemeColor.tsx`); the manifest is navy.
        - The photo viewer keeps fixed colours (black in every theme). QR codes carry their own white.
    - **Settings** (`/app/settings`, new tab): Look (Phone · Light · Dark; changes at once and is saved for this phone by `setThemePreference`), Notifications (moved here from Patients), and Sign out.
    - **Bottom bar:** Today · Patients · + (amber in both themes) · Money (Insights) · Settings. Stock joins in P4.
    - **Today's Cockpit** (`Cockpit.tsx`, `CockpitLive.tsx`, logic in `src/lib/cockpit.ts`, unit-tested), today only, under the Today heading:
        - open status and a live clock;
        - the seen ring (seen / everyone today, a mark per patient);
        - the next patient with a countdown and **Start visit**;
        - Collected, Requests and Owed (everyone who owes, from `getDues`);
        - the day strip (8:30 AM to 7:50 PM, lunch hatched, a "now" line);
        - controls: Walk-in, **Running late**, and Block time (jumps to Free times).
        - Running late is a sheet: pick 10, 15, 20 or 30 minutes, then a written WhatsApp per patient still to come (`runningLateMessage`, first name only); he taps Send.
    - **Tests:** `e2e/cockpit.spec.ts` (Cockpit, Running late, the theme switch and that dark is really navy), the notification test now goes through Settings, unit tests for the strip, ring, next patient and the message.
- [x] **P3b, part 2 (21 Oct):**
    - **Screen changes** (`PageTransition.tsx`): each screen fades in as it opens, played with the Web Animations API on a wrapper that stays mounted.
        - A wrapper keyed by the address remounted the page and broke Next 16 keeping a screen's state for Back (the half-typed New patient form was lost; `today.spec.ts` caught it).
        - Only opacity moves, so nothing fixed to the screen shifts while it plays.
    - **Game touches** (Settings → Game touches, on by default, the `clinic-fun` cookie):
        - when everyone today has been seen, the ring glows once and an "Everyone has been seen" chip shows;
        - "N days in a row, every visit sent" counts past clinic days on which every visit was finished and sent (`src/lib/streak.ts`, unit-tested; data in `src/lib/data/streak.ts`; days without visits don't break the run).
    - **Responses:** a short vibration on Android for Start visit, Running late and the switches.
    - **Switches:** the checkbox now covers the whole switch, so a tap anywhere on it works (`FunSwitch`, the notification toggles).
- [ ] **P3b, part 3:**
    - **Pause online booking**: needs a small SQL, a flag that `get_open_slots` and `submit_booking_request` respect, plus the Cockpit control;
    - optimistic Send and payments.
- [x] **P4, part 1: the database (21 Oct)** (`supabase/stock-costs-2026-10.sql`, folded into `schema.sql`; the owner runs it after the notifications SQL):
    - **Tables:** `stock_items` (unit, low level, supplier, last price, archive) and `stock_moves` (in / use / count / waste, unit cost, expiry, the bill it came on).
    - **Materials per treatment:** `treatment_materials`, keyed by the price-list charge exactly as the sheet names it ("Fillings – 3M Z350 Composite"). The trigger `visit_charges_use_materials` takes them off stock when that charge is added; removing the charge cascades the use away, so the stock comes back (this covers Undo too).
    - **Costs:** `costs` (category, paid by, payee, bill photo, optional visit for a lab fee) and `fixed_costs` (monthly or yearly). A regular bill can be marked paid only once a month.
    - **Also:** the `stock_levels` view (on hand, next expiry); the private `cost-bills` folder with per-account access; and the morning brief now lists up to five low items ("Low: Composite A2").
    - **Names:** chosen so they don't bring back the removed `expenses`, `recurring_expenses` and `treatment_items`.
    - **Checks:** `supabase/tests/stock.check.mjs` 18/18 (notify 31/31, booking 133/133 and logic 35/35 still pass).
- [ ] **P4, part 2: the screens:**
    - **2a Stock, done 22 Oct (commit 607ad2f, not pushed until the owner runs `supabase/stock-costs-2026-10.sql` and `e2e/stock.spec.ts` passes against it):** the Stock tab (low first, then expiring within 30 days, search from 8 items), Add an item (with the starting count as an "in" move), the item page (on hand, Add stock, Used or thrown away, Count, history in words, Remove for moves made there), Edit and Remove from the list (archive; also drops its treatment materials). Low and expiring stock shows on the Cockpit; the bottom bar is Today · Patients · + · Stock · Money and Settings is the gear on the Cockpit. Logic in `src/lib/stock.ts` (unit-tested); `getStock` returns `ready: false` before the SQL, so Today and the tab don't break.
    - **2b Costs, done 22 Oct (committed locally, not pushed: same condition as 2a, plus `e2e/costs.spec.ts`):** Money shows Spent and "Left after costs" (collected minus the month's costs) and leads to Costs (`/app/costs?m=`): spent by kind with bars, Add a cost (amount, what for, paid to, paid by, date, note, bill photo uploaded under the cost's own id so a retry never stores it twice), the regular bills due that month with **Mark paid** (amount editable; once a month, by the database's unique index), every cost (opens with its bill photo and Delete). Regular bills (`/app/costs/regular`): add, edit, stop (one never due yet is deleted). No Salary option: he works alone. Logic in `src/lib/costs.ts` (unit-tested).
    - stock items, bills in, use and counts;
    - materials per treatment (optional: deducts stock automatically, with Undo);
    - fixed and variable costs with bill photos;
    - Money: monthly profit, costs by category and margins;
    - low-stock and expiry alerts;
    - bottom bar: Today · Patients · + · Stock · Money;
    - import Rahil's spreadsheet of supplies, costs and lab fees. The blank he fills in is `for-dr-rahil/Stock-and-costs-to-fill.xlsx` (outside the repo, made 21 Oct). Headers are in row 2 and data starts in row 3; skip rows starting "Example:".
        - **Supplies:** Item, Kind (the `stock_items` categories), Counted in (unit), How many now (the first count), Warn me at (low level), Usual supplier, Price per unit (₹), Expiry date.
        - **Regular bills:** Bill, Kind (Rent, Electricity, Internet and phone, Software, Equipment payment, Repairs, Other: the `fixed_costs` categories; no Salary, he works alone), Amount (₹), Every (Month or Year), Usually paid on (day of the month).
        - **Lab fees:** Work, Lab, Fee (₹). No table holds these yet: decide whether they become a cost per visit or a fee per treatment for margins.
        - **Materials per treatment:** the 35 price-list options, named exactly as the sheet names charges, then Item used and How much per treatment (extra rows for extra items).
- [ ] **P3c. The HUD for Visit, Patients, Requests and Money.**

## Logic fixes (owner's bug: deleting a visit showed an advance)
- [x] Logic audit (Opus, max): `docs/build/review-logic.md` (25 findings, invariants 1-31, one migration)
- [x] **Owner's OK, then apply `supabase/logic-fixes-2026-10.sql` live** (applied 15 Oct) (pre-checks done 12 Oct: it deletes 1 loose payment of ₹10,600, the owner's deleted test visit; nothing else to fix). Owner replies "apply the logic fixes". Run it with `npx supabase db query --linked --project-ref pmuecirfwmtsvojxleoq --file supabase/logic-fixes-2026-10.sql`, then verify with the read-only checks at the top of the file.
- [x] **Finish L2** (merged 15 Oct) (calendar, requests, duplicate patients; `docs/build/L2-calendar-requests.md`): stopped by the usage limit. Work saved as **WIP commit b530d79 on branch `worktree-agent-af4eab21f0f61b7af` (pushed to GitHub)**: 17 files changed + `request-hold.ts`, `appointments/[id]/cancelled/`, `supabase/tests/logic.check.mjs`; it was adding the e2e tests to `times.spec.ts`. Nothing run yet (tsc, unit, lint, build, e2e, PGlite). It also edited `src/app/app/page.tsx` (L1's file): reconcile. To resume: new worktree from that branch (or merge it into a fresh builder's worktree), finish the tests, run every gate, then merge to `main`.
- [x] **L1** (money and visits, merged 15 Oct; `docs/build/L1-money-visits.md`, Opus high): start **after** the migration is applied and L2 is merged (both edit `src/app/app/page.tsx`); push `main` first.
- [x] Merge, gates, tour, push
- [ ] Owner checks on the phone: delete a visit with a payment (refused, names the amount), money the same on every screen, "Bill changed – send again".

### Next ideas (not started)
- Tally: `docs/TALLY.md` (proposal: day-end money card, "Send to Tally" export, dues with age + reminder, month at a glance; questions for Dr. Rahil first).
- Owner phone check of "Send prescription photo" (share sheet) on the OnePlus 13.
- Optional Wave 4: short prescription link (C20).

## Log
- 2026-10-11 Evidence tour run on a production build (OnePlus 13 profile). Found: "Tidy up" hangs (gemini-3.8-flash overloaded on the free tier, and the Google library retries timeouts 4 more times); 4 Back-gesture failures; time pickers never pre-select (timestamp text mismatch); next visit booked by default.
- 2026-10-11 Fresh-eyes reviewer (Opus 5.5, max) wrote `docs/SIMPLIFY.md`. Orchestrator verified its three main technical claims (SlotScheduler timestamp comparison, SDK default `maxRetries: 4` with timeouts retryable, next visit pre-filled in VisitSendStep).
- 2026-10-11 Owner: "yes on all" (D1–D5, the architecture, Supabase CLI access). Wave 0 started. Removed the four old agent worktrees (2.4 GB). Supabase CLI confirmed signed in; `db query --linked --project-ref` works. Live data is trial data only (Dr. Rahil: 1 TEST patient, 1 request; test account: leftovers).
- 2026-10-11 Applied `supabase/patch-age.sql` live via the CLI: `birth_year` on patients and booking_requests; `submit_booking_request` now takes an optional `p_birth_year` (11 arguments; the old 10-argument version dropped, the website's named-argument call still matches); confirm copies it. PGlite: 115 passed.
- 2026-10-11 Split `e2e/clinic.spec.ts` into four spec files plus `e2e/helpers.ts` (scoped clean-up by runId; `cleanTestAccount()` sweep for the tour only). Dropped the AI tidy-up e2e test (feature removed by D2; it was failing on the Gemini outage). Playwright profile: OnePlus 13 (412x905, Android 15 Chrome UA). `E2E_PORT` env. 13/13 pass; test account left with zero rows and zero photo files.
- 2026-10-11 Wave 0 complete. Briefs in `docs/build/`. `main` fast-forwarded to this commit and pushed; local work moves to `main` (the `rework-flow` branch is retired). Next: spawn builders 1A (Opus, high, port 3101) and 1B (Sonnet, medium, port 3102) in their own worktrees.
- 2026-10-11 Wave 1 started from `main` @ 1adea50: builder 1A (Opus 5.5, high, `docs/build/1A-visit.md`, port 3101) and builder 1B (Sonnet 5.5, medium, `docs/build/1B-times.md`, port 3102), each in its own worktree under `.claude/worktrees/` on a `worktree-agent-*` branch. If this session ends before they report: list those branches, check each one's last commit and gate results, then review and merge (1B first, it is smaller), or re-run a builder from its brief.
- 2026-10-11 Builder 1B done (4daa19e): `sameInstant()` fixes the pickers; drag removed; solid Save bar; search-as-you-type booking (`findPatientsToBook`, rows 56 px); gender required for phone-booked new patients; fallback "Open WhatsApp" buttons; `movedMessage`; `/app/appointments/[id]` and `/app/calendar` redirects deleted; 48 dp on its screens. Orchestrator reviewed the diff (search input escaped, stale results ignored), merged to `main` (cff4247): tsc, 208 unit, lint, build, 15/15 e2e pass. Pushed. Open item for 2A: `BackLink` in `ui.tsx` is ~16 px tall. Note: after removing a route, delete `.next/dev/types` before `tsc`.
- 2026-10-11 Builder 1A done (3ca78a8): one Visit page (notes autosave 1.5 s with on-phone draft and offline retry; photos upload on pick with Prescription / X-ray / Other chips; price-list sheet; one payment card with Cash received and a full-screen UPI QR; next visit "None" by default; Send on WhatsApp; Delete visit at the bottom); Start visit reuses today's visit (id made on the phone); empty visits hidden; AI tidy-up and `src/lib/ai/` deleted; privacy page updated; `useBackToClose` (`FullScreen.tsx`) closes sheets on Back. New components: `FullScreen`, `VisitNotes`, `PriceListSheet`, `PaymentCard`, `NextVisit`, `SendWhatsApp`, `StartVisitButton`.
- 2026-10-11 Orchestrator review asked for two fixes: (1) photo links were 30-day on every page view; restored the recorded decision: 1-hour links on screen, 30-day links only for ticked photos at the Send tap (`markWhatsappSent(visitId, photoIds)` returns them; WhatsApp opens within 2 s of the tap or a big "Open WhatsApp" button appears); (2) every autosave refreshed the whole page; now only the first note on an empty visit and the save on leaving refresh other screens. The builder hit the usage limit mid-fix; the orchestrator finished it (lint: Date.now in a handler replaced by a timer flag; e2e handles the "Open WhatsApp" fallback), commit 2a32bc5.
- 2026-10-11 Merged 1A (e493be5). Gates on `main`: tsc, 141 unit, lint, build, e2e 17/17 (after fixing a time-of-day flake in `times.spec.ts`: late in the day the booking test moves to the next day). Tour updated to the one-page visit. Pushed 0e6b8fe.
- 2026-10-11 Tour after Wave 1 (production build, OnePlus 13 size): walk-in 13 taps / 8 typed / 1 date picker / 3 screens (baseline 15 / 10 / 1 / 5); Back from the visit goes to Today, price list and UPI QR close on Back (3 Back failures left, all Wave 2 screens); Clinic OS controls under 48 dp 20 (baseline 54; all on Wave 2 screens); notes "Saved" 2.4 s after typing; request asks preselected, move marks the current time. Brief 2A refreshed with these facts. Fresh-eyes reviewer (Opus, high) reviewing Wave 1, writing `docs/build/review-wave1.md`.
- 2026-10-11 Fresh-eyes review of Wave 1 done: blocker #1 (WhatsApp message built from the page as shown at the tap, so a next visit or payment saved a moment earlier can be missing; seen in the tour), should-fix #2-#6 (blank booking page after the last time, Start visit can reopen an old visit, duplicate charge/payment on a lost reply, failed photo uploads only in memory, an old notes retry can overwrite newer notes). Brief `1C-visit-fixes.md` written; 2A brief adjusted (port 3102; does not edit VisitFlow, visit.spec or times.spec; adds #15). Spawning 1C (Opus, high) and 2A (Sonnet, medium) in parallel; 2B after one finishes.
- 2026-10-11 Spawned from `main` @ 00e7a05: builder 1C (Opus 5.5, high, `docs/build/1C-visit-fixes.md`, port 3101) and builder 2A (Sonnet 5.5, medium, `docs/build/2A-today-patients.md`, port 3102), each in a worktree on a `worktree-agent-*` branch. Both told to commit "WIP 1C:" / "WIP 2A:" if they hit a usage limit. If this session ends first: list `worktree-agent-*` branches, check their last commits, finish or review, merge 1C first (2A may break steps in visit.spec / times.spec that the orchestrator then fixes), then start 2B.
- 2026-10-11 Builder 2A done (45e8fc8; its gates: tsc, 140 unit, lint, build, today.spec 8/8). Today is one time-ordered list with Start buttons; "+" opens New patient; Patients searches while typing (`PatientSearch`, `findPatients`); New patient asks Age (stored as `birth_year`, helpers in `src/lib/patient-fields.ts`); Practice mode, the top bar and the menu are gone (Sign out at the bottom of Patients). Orchestrator reviewed the diff and merged it before 1C (no shared files) as f43e427, so 2B starts from it. To fix after 1C merges: `visit.spec.ts` lines 40-41 (the "Add" button is gone; "+" is the "New patient" link) and ~203 (/New visit/ is now "Start visit", or the link "Open today's visit"); `times.spec.ts` line 98 ("Book next visit" is now "Book appointment"); `book/page.tsx` age via `patientAge`. For Wave 3: `is_test` is still selected in `data/appointments.ts`, `data/billing.ts`, `data/visits.ts`; the patient page's Details still shows "Born:".
- 2026-10-11 Builder 2B done (ed491af). It started from the pushed `main` (ca0ad99), not the local one: **worktrees start from `origin/main`, so push before spawning a builder.** It therefore missed the refreshed brief's request-page item; the orchestrator did it (age via `patientAge` on the request screen and its phone matches, `TestBadge` deleted).
- 2026-10-11 Builder 1C done (eb1ce42): all 14 Wave 1 findings. Send waits for saves still on their way (`save`/`whenSaved` in VisitFlow), `markWhatsappSent` returns the message data read fresh (`MessageData`); "Open WhatsApp" link no longer swapped on tap; booking page opens the next day with a free time ("No times left today", big "Next day"); Start visit reuses an id only for this patient's visit today; charge/payment ids made on the phone (`useSaveId`, 23505 = already saved); failed photos retry every 10 s and on `online`, Send waits for them; notes save the newest on-phone draft and stop retrying on a server refusal; "Change" on a next visit booked here; "Other visits" instead of "Earlier balance"; 10-photo message; appointment linked to an existing visit; 48 dp name link; Save bar on the bottom bar.
- 2026-10-11 Orchestrator reviewed 1C and 2B, merged 1C (6f05328) and 2B (5fbef0a) after 2A, fixed the e2e steps 2A changed ("+" link, "Start visit", "Book appointment") and the booking page's age (`patientAge`). Gates on `main` (62a1095): tsc, 141 unit, lint, build, **e2e 25/25**. Pushed.
- 2026-10-11 Tour after Wave 2 (production build, OnePlus 13 size), all jobs ok: walk-in **12 taps / 8 typed / 0 date pickers** (baseline 15 / 10 / 1); phone booking from a free time 3 taps + 1 typed (baseline 6 + 1); returning patient 2 taps + 1 typed; website 4 taps / 4 typed / 0 pickers on 2 screens, Send on the details page. **Back failures 0** (baseline 4). Clinic OS controls under 48 dp: only the photo ticks' 24 px boxes, inside 56 px labels (baseline 54). Notes "Saved" 1.9 s. The visit message now has "*Next appointment*" (blocker #1 fixed). Tour's half-typed-form check now uses in-app navigation (as on the phone): the name is kept. Next: fresh-eyes review of Wave 2 (Opus, high) → `docs/build/review-wave2.md`.
- 2026-10-11 Fresh-eyes review of Wave 2 (Opus, high) → `docs/build/review-wave2.md`: no blocker; 1C fixed all 14 Wave 1 findings (code paths checked). Should fix: #1 half-typed New patient form has no way to clear it (an old medical alert can land on the next walk-in), #2 a photo can stay "Uploading…" for good and block Send, #3 a failed Patients search leaves the old list under "N results", #4 Today cuts seen names short and shows the same due three times, #5 website Back on step 2 loses everything, #6 website Send grey with no reason and required Reason below optional fields. Nice to have #7 (48 dp call button), #8 (Send timeout), #10 (link only today's appointment), #11 (website name/age rules); #9 (failed photos in IndexedDB) deferred until after go-live. Security: none. Briefs 2C (Clinic OS: #1-#4, #8, #10, `lookupPhone` session check) and 2D (website: #5-#7, #11) written; pushed before spawning (worktrees start from `origin/main`).
- 2026-10-12 Builders 2D (c594600: website Back returns to the times keeping the typing; required fields first, then "Optional"; Send always tappable and names what is missing; 48 dp "Call the clinic" buttons; `titleCaseName`/`parseAge` on the website) and 2C (f21b2ee: "Start fresh" and "Continuing <name>" on New patient; photo tries time out at 45 s, Remove while uploading, a removed photo is never added; failed Patients search clears the list and says so; Today's seen rows show the whole name with time and badges below, and a due on a listed visit is not repeated in "Needs you"; Send shows "Still trying… / Try again" after 15 s; `linkAppointment` only today's appointments; Send marks the patient's other bookings today done; `lookupPhone` checks the session). Orchestrator reviewed both diffs and merged. Gates on `main` (a6f3240): tsc, 141 unit, lint, build, **e2e 29/29**. Tour (production build): all jobs ok, walk-in 12 taps / 8 typed / 0 pickers, Back 5/5, visit message has the next appointment, no console errors, no small controls on Clinic OS or the booking form (only the website's shared header and footer links). Tour's collect step now taps the visit row when the due is shown there. Note: stopping a background `next start` task does not stop the server; kill the process on the port.
- Next: owner phone check on the OnePlus 13 (Waves 1 and 2), then Wave 3 (builder 3, `docs/build/3-cleanup.md`, refreshed).
- 2026-10-12 Builder 3 (clean-up, Sonnet medium, `docs/build/3-cleanup.md`, port 3101) spawned from `main` @ f1aa26a. Orchestrator pre-check on the live database (read-only): `reminder_log`, `expenses`, `recurring_expenses`, `day_closes`, `treatment_items`, `share_links` and the `expense-receipts` files are all empty; 1 patient (Dr. Rahil's trial patient) has `date_of_birth` but no `birth_year` (the script's backfill covers it); no visit has a `summary`.
- 2026-10-12 Builder 3 done (8da79dd): `supabase/schema.sql` (one file), `supabase/cleanup-2026-10.sql`, layered SQL files deleted, `is_test`/`date_of_birth`/dead types/`beforeAction`/AI packages/unused photos removed, `getDues` lighter and only on today, docs rewritten. Orchestrator review: the live database has Supabase's storage delete guard (statement-level `protect_delete` triggers), which would have rolled the whole script back; patched to refuse if the receipts bucket has files and otherwise remove the empty bucket with `set local storage.allow_delete_query` (fc80dc7). PGlite: `booking.check.mjs` 104/104 from `schema.sql`; old layered files + clean-up (with the guard triggers stubbed) = `schema.sql`, 0 differences. Gates: npm ci, tsc, 136 unit, lint, build, e2e 29/29 against the live database (before the clean-up). Pushed and deployed (~75 s).
- 2026-10-12 Applying `cleanup-2026-10.sql` live was **blocked by Claude Code's safety check** (it drops tables and a storage bucket): needs the owner's explicit OK, or the owner runs it. Meanwhile website booking would have failed (the new code calls the 10-argument function), so `booking.ts` now retries with `p_date_of_birth: null` when the API answers PGRST202 (checked live with an invalid phone: no row saved). **Remove that retry after the clean-up is applied.** Live database unchanged.
- 2026-10-12 Owner: "apply the cleanup". Applied `cleanup-2026-10.sql` live via the CLI (one transaction, no errors). Verified read-only: the five tables and all listed columns are gone; only the 10-argument `submit_booking_request` and `confirm_booking_request` remain; buckets: `visit-photos` only; `share_links` and `app_config` kept; Dr. Rahil's trial patient kept its age (birth year backfilled). The `booking.ts` retry removed (the live API now answers the new call and refuses the old one; checked with an invalid phone, nothing saved). Gates: tsc, 136 unit, lint, build, **e2e 29/29 against the cleaned live database**.
- 2026-10-12 Owner: phone looks good but slow; delete Beta; prescription photo in WhatsApp and a professional message. (1) **Speed:** functions ran in Washington (`x-vercel-id: bom1::iad1::…`) while the database is in Mumbai (ap-south-1): every query crossed the world (~0.25 s each). Added `vercel.json` `"regions": ["bom1"]` (1d422e0); now `bom1::bom1::…`; `/book` 0.24–0.33 s (was 0.7–1.1 s). (2) Deleted the Supabase project "Smile Dental Clinic Beta" (gwqxtzwfxyyyrvarobee, Seoul) with the owner's explicit OK; nothing referenced it. (3) Brief `docs/build/4A-whatsapp.md` (Opus, high): professional styled messages; prescription as a real photo through the Android share sheet after the text (a `wa.me` link can only carry text).
- 2026-10-12 Speed, second step: the project signs sessions with ES256 (public JWKS), so `getDoctor()` and the proxy now use `supabase.auth.getClaims()` (verified on the server, refreshed when expired) instead of `getUser()` (a call to Supabase Auth on every request). Gates: tsc, 136 unit, lint, build, e2e 29/29. Live: unauthenticated `/app/...` still redirects to login (ade1ed4). Builder 4A (Opus, high) working on the WhatsApp brief.
- 2026-10-12 Builder 4A done (033b6c2), merged locally (not pushed yet: the owner sees the messages first). Messages: one look for visit, confirmation, moved and decline (header, "Dear <first name>", bold headings, lists, bold day and time, sign-off). Photo: after Send, "Send prescription photo" opens the share sheet with the ticked photos as files (fetched ahead of the tap) and a caption; no 30-day links when the phone can share files; links kept otherwise. Gates: tsc, 139 unit, lint, build, e2e 30/30 (share sheet stubbed); tour all jobs ok, no console errors. Needs one real-phone check of the share sheet.
- 2026-10-12 Owner: "Push now" (4A live, a0cf93f). Owner found: deleting a visit shows "Advance with us". Cause: `payments.visit_id ... on delete set null` keeps the visit's payments as unlinked rows, which count as an advance. Owner asked for every bug of this kind. Spawned a fresh-eyes **logic audit** (Opus, max) → `docs/build/review-logic.md`: invariants for every table, every action walked against them (deletes, cancels, order, duplicates, time, retries, amounts), proofs in PGlite (never live), fixes and one migration. Fix builders follow.
- 2026-10-12 Logic audit done (`docs/build/review-logic.md`): 25 findings (2 blockers: deleted visit's payments become a phantom advance; money summed four ways), invariants 1-31, one migration (`supabase/logic-fixes-2026-10.sql`, PGlite 6/6, booking checks 104/104). Live pre-checks: 1 loose payment (₹10,600, the owner's deleted test visit; deleted by step 1, **owner's OK asked**), no duplicate visits, 1 done appointment without a visit (kept), no stray photo files, no shared phones, no dropped alerts. Briefs L1 (money and visits, Opus high, port 3101; starts after the migration) and L2 (calendar, requests, patients, Opus high, port 3102; starts now, works before and after the migration).
- 2026-10-12 Builder L2 (Opus, high) stopped by the usage limit mid-work; orchestrator committed its changes as WIP b530d79 on `worktree-agent-af4eab21f0f61b7af` and pushed the branch (untested, not merged). Owner asked for a Tally plan: `docs/TALLY.md`. Owner's weekly usage nearly out: everything saved and pushed; resume from the "Logic fixes — resume here" checklist above.
- 2026-10-15 Owner: "resume the build and apply the logic fixes". Re-ran the live pre-checks (0 loose payments, 0 duplicate visits: nothing deleted) and **applied `logic-fixes-2026-10.sql` live**; verified: payments.visit_id not null, `resend_needed`, one-visit-per-day index, the three triggers, `visit_money`. Owner: force WhatsApp Business on Rahil's phone: Clinic OS now turns every wa.me link (taps and code) into an Android intent for `com.whatsapp.w4b` with wa.me as fallback (`src/lib/whatsapp-business.ts`, `WhatsAppBusiness.tsx` in the clinic layout; off under test automation). The share sheet (prescription photo) can't be forced: pick WhatsApp Business there. Gates: tsc, 141 unit, lint, build, e2e 26/27: the 1 failure (and 3 not run) is **this PC's clock, 9 h 23 min slow and not syncing** (`w32tm`: Local CMOS Clock): the local test server offered 8:30 AM 'today' while the database (real time) refused it as past. Not an app bug; owner to turn on automatic time.
- 2026-10-15 Builder L2 done (7f6e3e8, on top of the WIP b530d79): findings 8a-d, 10, 11, 12, 17, 22, 23b, 24; `schema.sql` includes the live migration (PGlite: no differences); `supabase/tests/logic.check.mjs` 35/35, `booking.check.mjs` 104/104. Orchestrator reviewed (every action checks the session; phone-made patient ids validated) and merged. PC clock fixed by the owner. Gates on `main`: tsc, 146 unit, lint, build, **e2e 36/36**. Pushed. L1 (money and visits) still running.
- 2026-10-15 Session ended while builder L1 was working. Orchestrator saved its uncommitted work as WIP ac8fea4 on `worktree-agent-ac5d33b6c9ca428f4` (pushed) and resumed the builder: merge origin/main (L2), finish, run all gates.
- 2026-10-15 Builder L1 done (54125a0): findings 1, 3-7, 13, 14, 18-21, 23a; one money rule `patientAccount` (src/lib/billing.ts, sums from the `visit_money` view) used by Today, the patient page, the visit page and the WhatsApp message; Send now prepares (`prepareWhatsapp`) and records the send (`markWhatsappSent`) when WhatsApp opens. Orchestrator review: shortened the record wait on the automatic path to 1.5 s so WhatsApp still opens within Android's few seconds after the tap. Merged. Gates on `main`: tsc, 162 unit, lint, build, **e2e 41/41**; tour all jobs ok, no console errors. Pushed. **All 25 logic-audit findings are fixed** (#25 needs nothing until a Delete patient exists).
- 2026-10-15 Website: new photo of Dr. Rahil pushed (side photo and its unused setting removed). Owner's answers on the next items recorded in `docs/build/PLAN-2026-10-next.md`; no agents from now on.
