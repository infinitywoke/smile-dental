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
- [ ] 1C Fixes from the review (Opus, high, `docs/build/1C-visit-fixes.md`, port 3101), in parallel with 2A
- [ ] Owner phone check on the OnePlus 13 (after 1C)

### Wave 2: Today, patients and the website form (two builders in parallel)
- [ ] 2A Today, navigation and patients (Sonnet, medium): C8, C9, C11, C12, C13 + parts of C5, C10, C15, C18, C21
- [ ] 2B Website booking (Sonnet, medium): C19 + website side of D3
- [ ] Merged, gates pass, tour re-run, fresh-eyes review, pushed
- [ ] Owner phone check on the OnePlus 13

### Wave 3: clean-up (one builder, orchestrator runs the database script)
- [ ] Builder 3 (Sonnet, medium): C22–C27 and what is left of C3 and C13
- [ ] Database clean-up script checked with PGlite and applied live
- [ ] Gates pass, pushed; owner does every daily job once on the phone

### Wave 4 (optional): short prescription link (C20)
- [ ] Owner creates a server-only Supabase secret key and adds it in Vercel
- [ ] Built, checked, pushed

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
