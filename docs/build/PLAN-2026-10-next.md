# Next plan (agreed with the owner, 15 Oct 2026) — waiting for the go-ahead

Built by the orchestrator directly (no agents). Each item ships on its own: build → tsc, unit, lint, build, e2e (+ PGlite for database changes) → push → one line in `docs/BUILD_LOG.md`. Database changes: read-only pre-check first, applied with the owner's OK. Supabase Pro: not now (later, when onboarding more dentists). Tally: parked until the owner has spoken to Dr. Rahil.

## Order
1. Backups to Google Drive (Rahil is live: data safety first)
2. Delete patient (password), with the choice to keep or delete the payments
3. Remove a next visit + "Undo" for quick actions (no clutter)
4. Website: "Confirm & send WhatsApp message", heads-up before WhatsApp opens, call-back fallback, abuse guards; tagged Google link and Business Profile steps
5. Holding a requested time only once the WhatsApp message has arrived
6. Patient voice note: test the booking-page recorder against the WhatsApp voice note
7. Appointment lengths (20-minute grid, defaults by treatment, later learned from his real timings)
8. Voice notes for Rahil: recorder → free transcription → Gemini sorts the notes (free tier now, paid later)
9. Extras: typed prescription, Google review request, tomorrow's reminders, "Didn't come", recall

## 1. Backups to Google Drive
- Nightly GitHub Actions job (private repo, free minutes): `pg_dump` of the database + a copy of the `visit-photos` bucket (Supabase's S3 access) → encrypted (rclone crypt, passphrase only the owner holds) → owner's Google Drive folder. Keeps 30 daily + 12 monthly copies. Fails loudly (GitHub emails the owner).
- Owner adds 4 GitHub secrets once: database connection string, Supabase storage S3 keys, Google Drive token (rclone, set up once on his PC with my steps), passphrase. I never see the values.
- `docs/RESTORE.md` with the restore steps; one test restore (into a throwaway database) before calling it done.

## 2. Delete patient
- Patient page → small red "Delete patient" at the very bottom → full screen listing what goes (visits, photos, notes, coming appointments, payments total) → password (re-checked on the server with his login).
- When the patient has payments, two buttons:
  - **"Delete patient, keep ₹X in the books"**: personal details, notes and photos are erased; the patient becomes "Deleted patient (15 Oct)" so visits, bill lines and payments still add up (matches Tally).
  - **"Delete everything, including ₹X of payments"**.
- Photo files removed first; coming appointments cancelled (offer the cancellation WhatsApp).

## 3. Undo and Remove (without clutter)
- Next visit: "Remove" next to "Change" (cancels that booking; offers the cancellation message if the visit was already sent).
- Quick actions (book next visit, add charge, record payment, mark a photo, block a time, a visit started by mistake): apply at once, then a bottom bar "Booked Thu 22 Oct, 8:30 AM · Undo" for 8 seconds. Nothing permanent on screen.
- Serious actions keep their confirm (delete visit) or password (delete patient). WhatsApp can't be unsent: every change after a message offers the correction message.

## 4. Website booking wording, fallback, abuse guards, Google link
- Before the button: "Next, WhatsApp opens with your request already written. Just tap Send — this lets Dr. Rahil see your request straight away and confirm your time." Button: **"Confirm & send WhatsApp message"**.
- Fallback (WhatsApp didn't open, or no WhatsApp): "No WhatsApp? Ask the clinic to call you" — saves the request as a call-back; Today shows it with a Call button. It does not hold the time.
- Abuse guards: existing database limits (one waiting request per number, 3 a day per number, 5 a day per device, 200 a day in all); a hidden honeypot field and a "filled in too fast" check against bots; requests never block a time unless verified (item 5); Cloudflare Turnstile (free) only if abuse appears.
- Google: link `…/book?utm_source=google&utm_medium=business_profile` pre-fills "How did you hear: Google"; owner adds it in Business Profile → Edit profile → Appointment links.

## 5. Hold only after the WhatsApp message arrives
- A web page cannot see Rahil's WhatsApp. The only way to know a message was sent and received is WhatsApp's own Business Platform (Cloud API), which can now be connected to the existing WhatsApp Business app number ("coexistence"; the app keeps working). Incoming messages reach our server (webhook), which matches the request code and starts the hold. It also unlocks automatic confirmations, reminders, review requests and real photo/PDF attachments later. Needs the owner's Meta Business setup (a few days, receiving messages is free).
- Until then: a request is "Waiting for WhatsApp" and holds nothing; when Rahil taps the request link inside the WhatsApp message, it is marked received and held for 2 clinic hours (never past the appointment; night requests until 10:30 AM next open day) unless he confirms at once.

## 6. Patient voice note: test both
- Variant A: recorder on the booking page ("🎤 Tell Dr. Rahil what's bothering you" with prompts: which tooth, since when, hot/cold, biting, at night, swelling; up to 60 s; attached to the request; secure upload: only a just-made request, one note, ≤1 MB).
- Variant B: the WhatsApp message invites a voice note, and the page shows how ("after Send, hold the 🎤 in WhatsApp and tell Dr. Rahil…").
- Each visitor gets one variant (alternating), stored on the request; the card shows where to listen. After 2–3 weeks compare how many sent one and which Rahil found more useful, keep the winner.

## 7. Appointment lengths
- 20-minute grid; length chips 20 / 40 / 60 / 80 / 120; defaults by treatment (check-up 20, scaling 40, filling 40, extraction 40, root canal 60, crown preparation 60, review 20), changeable.
- Smarter: the website picks the length from the reason the patient chose (invisible to them); later, defaults learn from his real visit times (median of his last similar visits), shown as a suggestion.
- Database: `is_clinic_slot` for 20-minute starts, `get_open_slots(length)`; overlap rule unchanged.

## 8. Voice notes for Rahil (free now, Gemini paid later)
- Recorder (tap, pause, stop; no time limit); audio saved with the visit, so it can be transcribed again later.
- Free transcription on the phone itself: Whisper running in Chrome (transformers.js, WebGPU on the OnePlus 13; model downloaded once and cached). Private: the audio never leaves the phone.
- Sorting: text with the patient's name, phone and address removed → Gemini free tier → Complaint, Findings, Treatment, Prescription, Advice + suggestions (charge, next visit length and day) that he taps to accept. Timeouts and a "Sort later" fallback (the free tier is sometimes overloaded).
- Later: switch to Gemini's paid plan (audio straight in, better accuracy, no training on data) with one setting.

## 9. Extras
- Typed prescription: one-tap medicine templates → a clean letterhead image sent on WhatsApp (replaces photographing handwriting).
- Google review request on WhatsApp: one tap on a finished visit, offered to every patient (Google forbids asking only happy ones), the owner's "write a review" link from the Business Profile.
- Tomorrow's reminders (evening card, one tap each), "Didn't come" for no-shows with a call-back list, recall for 6-month check-ups.

## Owner's one-time tasks
- GitHub secrets for backups (item 1).
- Business Profile: appointment link and the review link (items 4, 9).
- Gemini API key (free tier) in Vercel (item 8).
- Later, optional: Meta Business setup for WhatsApp's Business Platform (item 5).
