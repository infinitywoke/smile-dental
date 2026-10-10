# Clinic OS: build plan and agent architecture

**How** and **in what order** the rest of Clinic OS gets built. Read [PRODUCT.md](PRODUCT.md) first for the *what* and *why*, and [../AGENTS.md](../AGENTS.md) for coding rules.

Status as of **2026-10-10**.

---

## 1. Where we are

| Area | State |
|---|---|
| **Website** | Live. All pages/assets moved from the old repo. Booking form opens WhatsApp to the clinic (temporary until Phase 5). |
| **Hosting** | Vercel (`smile-dental-hin3.vercel.app`), auto-deploys `main` from the private GitHub repo `infinitywoke/smile-dental`. |
| **Auth** | Supabase email + password, locked to `ALLOWED_EMAIL`; sign-ups disabled in Supabase; session persists until Sign out. |
| **Phase 1: foundation** | Done and verified on the phone. |
| **Phase 2: patients and visits** | Done and verified on localhost: Today list, patient search (name/phone), new patient with returning-patient detection, patient page, visits with notes + dictation + captioned photos (private storage), photo viewer, delete visit. DB: `supabase/phase2.sql` (applied to the new project). |
| **Wave 0** | Done 2026-10-10 (agent swarm): review fixes, 124 unit tests, 7 end-to-end tests passing against the real app with the test login, `supabase/phase3-5.sql` (91 checks in local Postgres; **owner must run it in the SQL Editor**), shared types, AI scaffolding (`src/lib/ai/`), price parsing, privacy page, home-screen manifest. |
| **Next** | Owner runs `phase3-5.sql`; add `ANTHROPIC_API_KEY`; then Wave 1. Open items for Wave 1: store `version` in `visits.summary`; maybe `treatment_slug` on plan items; set `maxDuration` on the Claude route; update privacy page when share links / booking storage ship. |

## 2. What is left

Each item lists its **acceptance criteria**: what must be true on Dr. Rahil's phone for it to count as done.

### Wave 0: foundation for parallel work (orchestrator, inline)
- [x] Camera/gallery split; continuous dictation with animation; live preview.
- [x] PRODUCT.md and this plan.
- [ ] **Test harness:** Vitest for pure logic; Playwright (mobile Chromium viewport) for end-to-end flows, signed in as a **dedicated test account**. RLS keeps its data invisible to Dr. Rahil. Seed script for realistic test data.
- [ ] **Schema contract** for Phases 3–5 (section 3) as one SQL file, plus shared TypeScript types and a Claude client module (`src/lib/ai/`).
- [ ] **Privacy page** rewritten: what's collected, AI processing by Anthropic, photos, WhatsApp.
- [ ] **Home-screen app:** web manifest (name "Clinic OS", icon, standalone, start URL `/app`).

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
- **Website booking requests stored in the app** via a narrow `SECURITY DEFINER` RPC (`submit_booking_request`) callable by the public, with validation and rate limits; shown in Today with **Book** / **Contacted** / **Decline**. Keep opening WhatsApp afterwards as confirmation.

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
appointments      patient_id, starts_at timestamptz, duration_min (default 30), reason,
                  status booked|done|cancelled|no_show, from_visit_id?, visit_id?, reminder_sent_at?
booking_requests  name, phone, area, city, reason, preferred_date, preferred_time, notes, is_emergency,
                  status new|contacted|booked|declined, patient_id?, appointment_id?   (insert only via RPC)
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
| Before launch | Hosting plan decisions and backups (section 7). |

## 7. Risks, costs and operations
- **AI model and cost (owner decision 2026-10-10: cheapest model that does the job):** start the app's note tidy/extract and photo reading on **Claude Haiku 5.5** ($0.10 / $0.50 per million input/output tokens, roughly ₹0.1 per visit). Move up to Sonnet 5.5 ($2 / $10) or Opus 5.5 ($4 / $20) only if the AI evaluation set shows Haiku falls short. `CLAUDE_MODEL` in `src/lib/ai/claude.ts` is the single switch. Never use free-tier AI APIs for patient data (they may train on it).
- **Speech-to-text:** Claude doesn't take audio. Dictation uses the phone (in-app Web Speech or the Gboard mic); Claude tidies the text afterwards.
- **Backups:** the Supabase free plan doesn't give self-service restores. Before real patient data piles up, either move to Pro (daily backups) or add a scheduled export.
- **Free-tier limits:** Supabase 500 MB database / 1 GB storage (~3,000 resized photos); idle projects pause after about a week.
- **Vercel Hobby is for non-commercial use.** A clinic is commercial, so plan for Vercel Pro (or another host) before launch.
- **Privacy:** health data. Privacy notice must cover AI processing and photo storage (India's DPDP Act applies; get local advice if unsure). Anthropic API inputs aren't used for training by default.
- **Secrets:** only ever in Vercel env vars or git-ignored `.env*.local` files. Never in chat or the repo.
