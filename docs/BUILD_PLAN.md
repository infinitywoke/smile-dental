# Clinic OS: build plan and agent architecture

**How** and **in what order** the rest of Clinic OS gets built. Read [PRODUCT.md](PRODUCT.md) first for the *what* and *why*, and [../AGENTS.md](../AGENTS.md) for coding rules.

Status as of **2026-10-11**.

---

## 1. Where we are

| Area | State |
|---|---|
| **Website** | Live. All pages/assets moved from the old repo. Booking form collects the walk-in patient details and opens WhatsApp to the clinic (temporary until Phase 5a). |
| **Hosting** | Vercel (`smile-dental-hin3.vercel.app`), auto-deploys `main` from the private GitHub repo `infinitywoke/smile-dental`. |
| **Auth** | Supabase email + password, locked to `ALLOWED_EMAIL`; sign-ups disabled in Supabase; session persists until Sign out. |
| **Phase 1: foundation** | Done and verified on the phone. |
| **Phase 2: patients and visits** | Done and verified on localhost: Today list, patient search (name/phone), new patient with returning-patient detection, patient page, visits with notes + dictation + captioned photos (private storage), photo viewer, delete visit. DB: `supabase/phase2.sql` (applied to the new project). |
| **Wave 0** | Done 2026-10-10 (agent swarm): review fixes, 124 unit tests, 7 end-to-end tests passing against the real app with the test login, `supabase/phase3-5.sql` (91 checks in local Postgres; **owner must run it in the SQL Editor**), shared types, AI scaffolding (`src/lib/ai/`), price parsing, privacy page, home-screen manifest. |
| **Billing** | Built and live 2026-10-11: price-list charges, UPI QR, cash/UPI payments, WhatsApp bill text (no private link yet). Being folded into the visit flow in R2. |
| **Next** | Rework wave R (below) before smart notes. Owner ran `phase3-5.sql` and added `ANTHROPIC_API_KEY` in Vercel (2026-10-11; also needed in `.env.local` for local runs). **Phase 5a (online booking + calendar) is next, awaiting the owner's go-ahead**; then the rest of Wave 1. Open items for Wave 1: store `version` in `visits.summary`; maybe `treatment_slug` on plan items; set `maxDuration` on the Claude route; update privacy page when share links / booking storage ship. |

## 2. What is left

Each item lists its **acceptance criteria**: what must be true on Dr. Rahil's phone for it to count as done.

### Rework wave R: simpler flow and navigation (R1-R3 DONE on branch `rework-flow`, waiting for the owner to try the preview and merge)
Owner approved 2026-10-11 (all seven recommendations). Design is in PRODUCT.md, "Screens and flow". Work happens on a branch with a Vercel preview; Dr. Rahil keeps using `main` until the owner has tried the preview and merges. Changes to data are additive only.

| Phase | Scope | Done when |
|---|---|---|
| **R1** shell and Today | Tabs Today + Patients with a + button; ⋯ menu (Practice mode, Delete test data, Sign out); Today as the day sheet (day strip, Needs you with Confirm / Other time, schedule, free-time pills); one compact time picker; `/app/calendar` redirects to Today | **Done** (commit `b69e755`); e2e + build green |
| **R2** visit flow | Visit as Notes → Bill → Send; collapsed Add charge and UPI QR; one WhatsApp message (bill + next visit + 30-day prescription link made at send time); appointment ↔ visit link; `visits.closed_at`; statuses on Today | **Done 2026-10-11** (Gemini's partial work finished and reviewed by the orchestrator). `patch-visit-flow.sql` is already applied to the live project (Gemini ran it through the Supabase CLI); safe to re-run. Browser tests: 12/12 |
| **R3** patient hub | Smart primary button (`nextActionFor`, tested); coming-up appointments with Move / Cancel; money owed under Needs you on Today; book for a known patient (`/app/book?patient=`); `/app/appointments/[id]` and `/bill` redirect; dead code removed | **Done 2026-10-11**; browser tests 14/14, unit 160+ |
| **R4** smart notes | "Tidy up" in step 1 (Phase 3 below), confirm card, bill lines from procedures | acceptance of Phase 3 |

**Prescription photo in the WhatsApp message:** `wa.me` links can only carry text, so the message includes a **signed link** to the photo in the private bucket (30 days). The Send step lists the visit's photos with tick boxes; photos captioned "prescription" are ticked by default. Needs no new secret key. The privacy page gets a line about this.

### Wave 0: foundation for parallel work (orchestrator, inline)
- [x] Camera/gallery split; continuous dictation with animation; live preview.
- [x] PRODUCT.md and this plan.
- [ ] **Test harness:** Vitest for pure logic; Playwright (mobile Chromium viewport) for end-to-end flows, signed in as a **dedicated test account**. RLS keeps its data invisible to Dr. Rahil. Seed script for realistic test data.
- [ ] **Schema contract** for Phases 3–5 (section 3) as one SQL file, plus shared TypeScript types and a Claude client module (`src/lib/ai/`).
- [ ] **Privacy page** rewritten: what's collected, AI processing by Anthropic, photos, WhatsApp.
- [ ] **Home-screen app:** web manifest (name "Clinic OS", icon, standalone, start URL `/app`).

### Phase 5a: online booking and calendar (BUILT 2026-10-11; waiting for the owner to run `supabase/patch-booking.sql`, then e2e and push)
Owner request (2026-10-11): remove SOS, keep the booking page simple, show Dr. Rahil's real availability, and let him schedule or confirm a WhatsApp request in a few taps, with a confirmation going to the patient. Ships before the rest of Wave 1. When approved, update PRODUCT.md (hours, journey step 0, decision log).

**Schedule (40-minute blocks, India time):**
- **Revised 2026-10-11 (owner): hours stay as on the Google Business Profile**, 8:30 AM–1:00 PM and 2:30–7:30 PM, Fridays closed. Blocks must end before closing.
- Morning: 8:30, 9:10, 9:50, 10:30, 11:10, 11:50, 12:30 (ends 1:10).
- Afternoon: 2:30, 3:10, 3:50, 4:30, 5:10, 5:50, 6:30, 7:10 (ends 7:50). **15 blocks a day.**
- Owner allowed a slight overrun for the last block of each session. The 7:10 PM block starts after 7 PM, so it is phone/app only.

**Online booking rules** (enforced by the database, mirrored on the website for display):
1. A block can be requested online only if it starts **at least 2 hours after the request**.
2. Blocks starting **at 7 PM or later** are never offered online (none exist inside the hours today; the rule stays in the database). The website says "after 7 PM, or a time not shown, please call" with tap-to-call.
3. Fridays, breaks, Dr. Rahil's time off, booked blocks and blocks held by another pending request are never offered. Booking window: the next 4 weeks.
- Together these give the owner's rule: requests made **6 AM–5 PM** get same-day blocks at least 2 hours away. The last online block is 6:30 PM (7:10 PM is phone/app only), so nothing is left for the same day after 4:30 PM; night requests start the next day at 8:30, so he has at least 2 hours from 6 AM.
  - Examples: request at 10:00 AM → earliest 2:30 PM; 4:30 PM → 6:30 PM; 5:30 PM or 11 PM → tomorrow 8:30 AM.
- The patient is told: "Dr. Rahil will confirm on WhatsApp in **under 15 minutes**." Requests sent 9 PM–6 AM say "confirmed after 6 AM" instead *(owner to confirm)*.

**Website booking page (3 steps, no SOS):**
1. **Choose a time:** a day strip (Fridays marked Closed) and only the free blocks for the chosen day, plus the 7 PM call note.
2. **Your details:** the same fields as the clinic's New patient form: WhatsApp number, name, date of birth, address (one field), medical alerts, how they heard about us. Also reason for visit (chips) and an optional note.
3. **Review and send:** a summary and the 15-minute promise. **Send on WhatsApp** saves the request in the app's database first, then opens WhatsApp to the clinic with a short message ending in a **private booking link** (`/app/requests/<random id>`).

**Why a link, not a vCard (owner asked):**
- `wa.me` links can only pre-fill text; a web page can't attach a vCard or any other file to the patient's message.
- The share sheet would add three error-prone steps for the patient: pick WhatsApp, find the clinic, send.
- WhatsApp shows a contact card as Message / Add contact, with no reliable "share to app" option and no place for date of birth, alerts or time.
- The link does the same job in **one tap**. The installed Clinic OS opens straight on the request with everything filled in, on any phone, and the request is saved even if the patient never presses Send.
- The link opens only for Dr. Rahil's login, and it contains a random reference, not patient data.
- "Share to Clinic OS" (Android share target) can be added later if still wanted.

**Clinic OS:**
- **Calendar tab** (Today · Calendar · Patients · New · Money): a day view of the 15 blocks with the break. Swipe to change day; a week strip shows busy days.
  - **Free block:** tap to book an existing patient (search) or a new one, for phone bookings including 7:20 and 8:00 PM. Or **Block time** (blocked time disappears from the website).
  - **Booked block:** name and reason. Tap for Open patient / Start visit / Move / Cancel / WhatsApp.
  - **Pending website request:** amber.
  - **Close this day:** for holidays.
- **Today:** a "Booking requests (N)" card on top, then today's appointments, then today's visits.
- **Request screen** (from the WhatsApp link or Today):
  - **Patient card:** everything the patient typed, with medical alerts in red. If the phone matches an existing patient, it offers "Use this record". Family can share a number, so "New patient" stays possible.
  - **Calendar:** shows the requested day with the patient's **name chip already in the requested block**. Confirm as-is: **Save**. Reschedule: **slide the name chip** onto another free block, tap a free block (one-handed fallback), or swipe to another day.
  - **Save:** in one database transaction, creates the patient (or links the existing one), books the 40-minute block and marks the request booked. Then WhatsApp opens on the **patient's** chat with the confirmation (date, time, clinic address, map link) and he taps Send.
  - **Call** and **Decline** (Decline sends a polite "please call us to find a time").
- **Automatic sending** (no tap) needs the WhatsApp Business Platform: clinic number on the WhatsApp Business app, Meta business verification, an approved message template, and a token in Vercel.
  - Confirmations within 24 hours of the patient's message are free; later reminders cost a small fee per message.
  - **Not in this phase** (2026-10-10 decision: one-tap WhatsApp). The sending code sits in one function so it can be switched on later.
  - Unofficial WhatsApp Web automation is against WhatsApp's terms and can get the clinic number banned: never.

**Data and safety:**
- The database refuses overlapping booked appointments, so double booking is impossible even if two saves race.
- A pending request holds its block, and each phone number gets one open request at a time. Existing IP and phone rate limits stay.
- The public can only call two narrow functions: free block times (no names, nothing else) and submit a request.
- E2E bookings are test data and are removed with **Delete test patients**.
- The privacy page is updated: booking details are stored.

**Acceptance (on Dr. Rahil's phone):**
- The website shows only real free blocks: none sooner than 2 hours, none on Fridays, a call note for 7 PM+, and no SOS.
- The WhatsApp link opens the request in Clinic OS with every typed detail filled in.
- Leave the chip or slide it → **Save** → WhatsApp opens on the patient's chat with the confirmation. The block then disappears from the website.
- Blocking time or closing a day removes it from the website. Booking the same block twice is refused.

**Built (2026-10-11), by the orchestrator inline:**
- `supabase/patch-booking.sql` + 94 database checks (PGlite, clock pinned through `clinic_now()`), `src/lib/schedule.ts` + 11 unit tests, `src/lib/whatsapp.ts`.
- Website: `/book` (3 steps), `src/lib/actions/booking.ts`. Clinic OS: `/app/calendar`, `/app/calendar/book`, `/app/requests/[id]`, `/app/appointments/[id]`, Today cards, Calendar tab, sign-in returns to the page opened from WhatsApp.
- Pending: owner runs `patch-booking-hours.sql` (15 blocks); e2e (public page + request -> slide/tap -> save -> WhatsApp); push; Dr. Rahil's phone test.
- Known limits: the public request files under the clinic account, so e2e creates its test request as the test account (the public RPC path is covered by the database checks). The drag gesture is tested by hand; e2e uses the tap fallback.

**Build order** (lean workflow, section 4):
1. **De-risk (1 minute, Dr. Rahil):** tap a test `/app` link in WhatsApp. Does it open Clinic OS signed in? (The home-screen app or Chrome are both fine; only WhatsApp's own browser would need a tweak.)
2. **Database and rules (orchestrator, Opus high: security-sensitive):**
   - `supabase/patch-booking.sql`, tested in PGlite; the owner runs it once. Contents: new `booking_requests` columns, `time_off`, the double-booking guard, `get_open_slots`, `submit_booking_request` v2 and `confirm_booking_request`.
   - `src/lib/schedule.ts` (blocks and rules) with fixed-clock unit tests: 2 h, 7 PM, Friday, break, night.
   - Shared types. **Push before builders start.**
3. **Two Sonnet-medium builders in parallel worktrees:**
   - **A:** website booking page, hours and FAQ text, privacy page.
   - **B:** Calendar tab, request screen with slide-to-place, Save + confirmation, Today cards, time off, test-data cleanup.
4. **Integrate (orchestrator):** unit, build and lint. Extend e2e with the full loop: request on the website → open the link → move the block → Save → the block disappears from the website → clean up. Then one Sonnet review and deploy.
5. **Dr. Rahil's phone test** against the acceptance list, then fixes.

### Phase 3: smart notes (Wave 1, builder A)
- **Tidy + extract:** on **Tidy up** (and before Confirm), Claude returns a tidy sectioned note + structured data (schema in section 3), using structured outputs. Raw dictation kept in `notes_original`.
  - *Accept:* the Prakash dictation becomes sections (Complaint, Findings, Diagnosis, Treatment done, Plan, Medicines, Next visit) with "four six" → 46, "r c t" → RCT, "i o p a" → IOPA. Nothing is invented. Unclear words are listed, not guessed.
- **Confirm card:** one screen showing tooth, diagnosis, procedures done, plan with prices (ranges for undecided options), medicines, next visit, payment, patient-detail updates. Edit any field, then Confirm saves `visits.summary`, creates/updates `treatment_items`, and adds medical alerts to the patient.
- **Safety checks (deterministic code + model flags):** tooth vs complaint side; allergy vs drug class; medical alerts shown first.
  - *Accept:* "24" with "lower right" warns; "penicillin allergy" + "Amoxicillin" warns before Confirm.
- **Prescription photo reading:** a photo captioned/marked as a prescription is read (vision) and its medicines merge into the summary.
- **Model:** `claude-opus-5-5` (default; see section 7 for cost). Builders must load the `claude-api` skill before writing Claude code.

### Phase 4a: money at the chair (Wave 1, builder B)
- **Bill:** lines from procedures done (price list) + **extra lines** (description + amount, editable) for anything else. Total shown.
- **Payment:** Amount collected + **Balance next visit** *or* **Advance collected** → Submit. Amount → **UPI QR** (`upi://pay?pa=rahil.yusuf.k-1@okhdfcbank&pn=Smile%20Dental%20Clinic&am=<amount>&cu=INR&tn=<note>`) + **Received (UPI)** / **Collected cash** buttons.
  - *Accept:* GPay/PhonePe scanning the QR show the right payee and amount; patient balance updates.
- **WhatsApp visit message (one tap):** bill + medicines + aftercare + next appointment, plus a **private link** (`/r/<token>`, expires in 30 days) showing the bill and prescription photo without sign-in. The link page needs a server-only Supabase secret key (`SUPABASE_SECRET_KEY`, created fresh, set only in Vercel/.env.local, never pasted in chat).

### Phase 5: appointments and follow-up (Wave 1, builder C)
- **Next appointment:** from the summary (or a quick sheet) with **suggested slots** respecting hours, Friday closure, lunch, existing bookings and the patient's preferred times.
- **Today:** upcoming appointments (tap → start visit), then today's visits.
- **"To send today" list:** tomorrow's reminders, crown nudges (RCT done, no crown booked), 6-month recalls, unfinished plans. One tap opens WhatsApp; it's then marked sent.
- **Website booking requests and the calendar:** moved to **Phase 5a** (above). Phase 5 builds on its `appointments` and Calendar tab.

### Wave 2: integration (orchestrator)
- One **Finish visit** flow: notes → Confirm → bill → payment → WhatsApp → next appointment, pre-filled from the summary.

### Phase 4b: end of day (Wave 3, builder D)
- **Expenses:** form with addable lines (payee, category, amount, method, optional patient) + **bill photo** or **dictation** extracted by Claude; receipt photo kept (private bucket `expense-receipts`).
- **Fixed monthly costs:** defined once, suggested monthly for one-tap confirmation.
- **Daily close:** patients, UPI vs cash collected, cash expenses, **cash expected** vs counted, Close day, one-tap WhatsApp summary to his own number.

### Phase 6: insights (Wave 3, builder E)
- **Month dashboard:** profit vs last month, profit per treatment (fees − linked lab expenses), earnings per chair-hour, day/hour heatmap, new vs returning, sources, localities, unfinished treatments, option choices, recurring extras, expense trends, recalls due.
- **Ask in plain English:** Claude with **tool use over a fixed set of safe, owner-scoped query functions** (never raw SQL from the model).
- **Monday summary** card on Today.

### Wave 4: hardening and launch (orchestrator + reviewers)
- Scheduled **data export/backup**; final security review; performance pass on a mid-range Android phone; one-page "how to use" for Dr. Rahil; clinic domain + `siteConfig.url`; hosting plans (section 7).

## 3. Shared data model contract (draft; orchestrator finalises in Wave 0)

All tables: `id uuid pk`, `owner_id uuid not null default auth.uid()`, RLS "owner full access" (`owner_id = auth.uid()`), `revoke all ... from anon`, `created_at`/`updated_at` with the shared trigger. Money is `numeric(10,2)` rupees. Builders **must not** change this schema; ask the orchestrator.

```text
visits            + notes_original text, summary jsonb (schema v1), confirmed_at timestamptz
patients          + preferred_times text
treatment_items   patient_id, tooth text?, procedure text, price numeric?, price_min/price_max numeric?,
                  status planned|in_progress|done|cancelled, planned_visit_id?, done_visit_id?
visit_charges     visit_id, patient_id, description, amount >= 0, kind item|extra, treatment_slug?, treatment_item_id?
payments          patient_id, visit_id?, amount > 0, method upi|cash, kind payment|advance, reference?, received_at
share_links       visit_id, token (random, unique), expires_at
appointments      patient_id, starts_at timestamptz, duration_min (default 30; 40 for calendar blocks), reason,
                  status booked|done|cancelled|no_show, from_visit_id?, visit_id?, reminder_sent_at?
                  Phase 5a: no two 'booked' appointments may overlap (exclusion constraint)
booking_requests  name, phone, area, city, reason, preferred_date, preferred_time, notes, is_emergency,
                  status new|contacted|booked|declined, patient_id?, appointment_id?   (insert only via RPC)
                  Phase 5a: + address, date_of_birth, medical_alerts, heard_from, requested_start timestamptz, is_test
time_off          Phase 5a: starts_at, ends_at, note   (hidden from the website's free blocks)
RPCs (Phase 5a)   public: get_open_slots(from, days) -> free block start times only; submit_booking_request v2
                  signed in: confirm_booking_request(request, starts_at, patient?) -> patient + appointment in one transaction
reminder_log      kind appointment|crown|recall|unfinished|booking, ref_id, sent_at
expenses          spent_on date, payee, category lab|materials|rent|salary|utilities|equipment|other,
                  description, amount > 0, method cash|upi|bank|card, patient_id?, treatment_item_id?, receipt_path?
recurring_expenses name, payee, category, amount, method, day_of_month 1-28, active
day_closes        day date unique per owner, cash_counted, cash_expected, note, closed_at
```

**Visit summary JSON (v1)**, validated with Zod in `src/lib/ai/visit-summary.ts`: `tidy_note`, `complaint`, `findings`, `teeth[{tooth, note}]`, `diagnoses[{tooth?, diagnosis}]`, `procedures_done[{tooth?, procedure, treatment_slug?, amount?}]`, `plan[{tooth?, procedure, price?, price_min?, price_max?}]`, `medicines[{name, dose?, frequency?, duration?, instructions?}]`, `aftercare[]`, `next_visit{when_text, date?, time?, within_days?}?`, `payment{collected?, method?, advance?, balance_next_visit?}?`, `patient_updates{medical_alerts_add[]?, preferred_times?}?`, `warnings[]`, `unclear[]`.

## 4. Workflow (lean, revised 2026-10-10)
Wave 0 used a large agent swarm on Opus. It worked, but it spent far more quota than a single-user app needs. From now on:

1. **Fresh session per task.** Read PRODUCT.md, this plan and memory; don't rely on chat history.
2. **Orchestrator (main session)** makes decisions with the owner, fixes contracts (schema, types, file ownership) before any parallel work, integrates and deploys. Owner sets the session model: Sonnet/medium for routine work, Opus/high for database, security or AI-prompt design.
3. **Delegates** follow the model and effort table in AGENTS.md (Haiku or Gemini Flash for lookups and log summaries, Sonnet for routine builders, Gemini Pro or Sonnet for a second-opinion review, Opus only for security-sensitive work). Small jobs are done directly; at most 1–2 parallel builders, each in its own worktree. **Push the base commit before creating worktrees** (worktrees branch from the remote) and install packages once.
4. **Quality gates are mostly free scripts:** build, lint, unit tests, e2e smoke. One review per wave; an Opus security review only when database or auth rules change.
5. **Acceptance is Dr. Rahil using it on his phone.** Questions for the owner are batched once per wave.

## 5. Testing
- **Unit (Vitest, `npm test`):** pure logic where mistakes cost money or data: phone, dates, dictation, sign-in lock, price parsing, visit summary schema. 124 tests, about 5 s.
- **End-to-end (Playwright, `npm run test:e2e`):** one smoke flow signed in as the test account (credentials in git-ignored `.env.test.local`): sign in, add a test patient, visit with photo, Today, search, returning patient, delete test patients, sign out. About 25 s. It cleans up after itself.
- **Database (`supabase/*.sql`):** checked in a local Postgres (PGlite) before handing to the owner whenever rules change.
- **Test data:** every test patient is marked **Test patient** (`patients.is_test`) and removed with **Delete test patients** on the Patients screen; automated test patients are also named `E2E-...`.
- **AI evaluation (Phase 3):** 15–20 realistic dictations with expected fields, run before choosing or changing the model.

## 6. Inputs needed from the owner
| When | What |
|---|---|
| Wave 0 | Phone test of camera + dictation. Create a **test login** in Supabase (credentials go in a git-ignored `.env.test.local`, never in chat). |
| Wave 1 | **Anthropic API key** (console.anthropic.com, billing + monthly spend limit) set as `ANTHROPIC_API_KEY` in Vercel and `.env.local`. A fresh **Supabase secret key** for the private bill link, set as `SUPABASE_SECRET_KEY` the same way. |
| Phase 5a | Answers to the open points (8:40–9:00 buffer, Fridays, 7 PM rule every day, night-request wording, one-tap vs automatic WhatsApp). Dr. Rahil's 1-minute link test. Run `supabase/patch-booking.sql`. Only if automatic WhatsApp is wanted later: clinic number on the WhatsApp Business app + Meta business verification. |
| Before launch | Hosting plan decisions and backups (section 7). |

## 7. Risks, costs and operations
- **AI model and cost (owner decision 2026-10-10: cheapest model that does the job):** start the app's note tidy/extract and photo reading on **Claude Haiku 5.5** ($0.10 / $0.50 per million input/output tokens, roughly ₹0.1 per visit). Move up to Sonnet 5.5 ($2 / $10) or Opus 5.5 ($4 / $20) only if the AI evaluation set shows Haiku falls short. `CLAUDE_MODEL` in `src/lib/ai/claude.ts` is the single switch. Never use free-tier AI APIs for patient data (they may train on it).
- **Speech-to-text:** Claude doesn't take audio. Dictation uses the phone (in-app Web Speech or the Gboard mic); Claude tidies the text afterwards.
- **Backups:** the Supabase free plan doesn't give self-service restores. Before real patient data piles up, either move to Pro (daily backups) or add a scheduled export.
- **Free-tier limits:** Supabase 500 MB database / 1 GB storage (~3,000 resized photos); idle projects pause after about a week.
- **Vercel Hobby is for non-commercial use.** A clinic is commercial, so plan for Vercel Pro (or another host) before launch.
- **Privacy:** health data. Privacy notice must cover AI processing and photo storage (India's DPDP Act applies; get local advice if unsure). Anthropic API inputs aren't used for training by default.
- **Secrets:** only ever in Vercel env vars or git-ignored `.env*.local` files. Never in chat or the repo.
