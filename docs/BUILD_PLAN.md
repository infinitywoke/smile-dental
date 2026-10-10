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

## 4. Agent architecture

```
                         ┌──────────────────────────────┐
   Dr. Rahil / owner ◄──►│ ORCHESTRATOR (main session)  │◄── PRODUCT.md, BUILD_PLAN.md, AGENTS.md, memory
   decisions, keys,      │ decisions · specs · schema   │
   phone acceptance      │ integration · merge · deploy │
                         └──────┬───────────────┬───────┘
              Wave N briefs     │               │   after merge
        ┌───────────────┬───────┴──────┐        ├────────────────────┐
        ▼               ▼              ▼        ▼                    ▼
   BUILDER A       BUILDER B      BUILDER C   VERIFIER            REVIEWER
   (worktree)      (worktree)     (worktree)  unit + e2e tests    fresh-eyes security,
   owns its files  owns its files owns its    with test account;  correctness, Next 16
                                  files       reports repros      conventions; findings
```

| Role | Who | Isolation | Gets | Returns | When |
|---|---|---|---|---|---|
| **Orchestrator** | Main Claude session | main tree | Everything; talks to the owner | Specs, schema, integration, deploys | Always |
| **Builder** | General-purpose agent | **own git worktree** | A self-contained brief (template below) | Branch + summary + open questions | Waves 1 and 3, up to 3 in parallel |
| **Verifier** | General-purpose agent | main tree, read-only on code | Test commands + acceptance criteria | Pass/fail with exact repro steps | After each merge |
| **Reviewer** | General-purpose agent (or `/code-review`, `/security-review`) | read-only | The diff + rules | Prioritised findings with file:line | After each merge, before deploy |
| **Owner (human)** | Dr. Rahil / you | the real phone | Acceptance checklist | Sign-off or issues | End of each wave |

**Why this shape:**
- **Contracts first, then parallel work.** The orchestrator fixes the schema, shared types and file ownership *before* builders start, so parallel builders never edit the same file or invent conflicting tables.
- **Context written once.** Builders start cold. Everything they need is in PRODUCT.md, this plan and their brief, not in chat history.
- **Fresh eyes for quality.** Verifier and Reviewer never wrote the code they check.
- **Small things stay inline.** Spinning up an agent costs context; fixes under about an hour are done directly by the orchestrator.
- **Humans test what machines can't:** microphone, camera, UPI apps, WhatsApp.

### File ownership in Wave 1
- **A (smart notes):** `src/lib/ai/**`, `src/components/clinic/smart/**`, `src/lib/actions/summary.ts`.
- **B (money):** `src/lib/money/**`, `src/components/clinic/money/**`, `src/lib/actions/money.ts`, `src/app/r/**`.
- **C (appointments):** `src/lib/schedule/**`, `src/components/clinic/schedule/**`, `src/lib/actions/appointments.ts`, `src/app/app/appointments/**`, `src/components/site/PublicBookingForm.tsx`.
- **Orchestrator only:** `supabase/*.sql`, `src/lib/data/types.ts`, `src/app/app/page.tsx`, `src/app/app/visits/**`, `src/app/app/layout.tsx`, `BottomNav.tsx`. Builders expose components; the orchestrator mounts them.

### Builder brief template
1. **Goal** in one paragraph, linked to the PRODUCT.md journey step.
2. **Read first:** PRODUCT.md, BUILD_PLAN.md (sections 2–3), AGENTS.md, the Next docs topics that apply, and the `claude-api` skill if Claude is involved.
3. **You own** (may create/edit) / **read-only** / **must not touch**.
4. **Contract:** tables, types and function signatures to use exactly.
5. **Acceptance criteria** + required unit tests.
6. **Done means:** `npm run build`, `npm run lint` (no new warnings) and `npm test` pass; changes committed on your worktree branch; reply with a summary, files changed, and decisions you had to make or questions.

### Definition of done (every wave)
1. Build and lint clean; unit tests and the e2e smoke pass.
2. Reviewer: no open Critical/High findings.
3. Security checklist: every new page/action/route calls `getDoctor()` (or is intentionally public and rate-limited); every new table has the owner policy and `anon` revoked; no secret reaches the browser.
4. Owner's phone acceptance checklist passes.
5. Deployed; PRODUCT.md / this plan / memory updated.

## 5. Testing strategy
- **Unit (Vitest):** phone normalisation, India dates, price-list parsing (ranges, formulas), UPI link, WhatsApp message builder, safety rules, slot suggestions, balance maths, daily-close maths, summary validation.
- **AI evaluation:** 15–20 realistic dictations (Prakash and others) with expected key fields, run before/after any prompt or model change (costs cents per run).
- **End-to-end (Playwright, mobile viewport):** sign in as the test account → add patient → returning-patient match → visit with photo → confirm → bill → payment → appointment → booking request.
- **Phone acceptance (owner):** dictation, camera, UPI scan, WhatsApp hand-off, home-screen app.

## 6. Inputs needed from the owner
| When | What |
|---|---|
| Wave 0 | Phone test of camera + dictation. Create a **test login** in Supabase (credentials go in a git-ignored `.env.test.local`, never in chat). |
| Wave 1 | **Anthropic API key** (console.anthropic.com, billing + monthly spend limit) set as `ANTHROPIC_API_KEY` in Vercel and `.env.local`. A fresh **Supabase secret key** for the private bill link, set as `SUPABASE_SECRET_KEY` the same way. |
| Before launch | Hosting plan decisions and backups (section 7). |

## 7. Risks, costs and operations
- **AI cost (estimate):** Opus 5.5 at $4 / $20 per million input/output tokens. Roughly **$0.03–0.05 per visit** for tidy + extract, about **$0.015 per photo read**. At 20 patients a day that's very roughly **$15–30 a month**. Cheaper models (Sonnet 5.5, Haiku 5.5) are the owner's call, measured against the AI evaluation set before switching.
- **Speech-to-text:** Claude doesn't take audio. Dictation uses the phone (in-app Web Speech or the Gboard mic); Claude tidies the text afterwards.
- **Backups:** the Supabase free plan doesn't give self-service restores. Before real patient data piles up, either move to Pro (daily backups) or add a scheduled export.
- **Free-tier limits:** Supabase 500 MB database / 1 GB storage (~3,000 resized photos); idle projects pause after about a week.
- **Vercel Hobby is for non-commercial use.** A clinic is commercial, so plan for Vercel Pro (or another host) before launch.
- **Privacy:** health data. Privacy notice must cover AI processing and photo storage (India's DPDP Act applies; get local advice if unsure). Anthropic API inputs aren't used for training by default.
- **Secrets:** only ever in Vercel env vars or git-ignored `.env*.local` files. Never in chat or the repo.
