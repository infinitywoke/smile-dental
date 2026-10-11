# Clinic OS: product brief

The single source of truth for **what** we are building and **why**. Read this before working on any Clinic OS feature. Decisions here were made with the clinic owner; don't change them without asking.

## Who and what

- **Clinic:** Smile Dental Clinic, Katapadi, Udupi (details in `src/config/site.ts`).
- **User:** exactly one person, **Dr. Rahil Yusuf**, the dentist. No assistant, no front desk, no roles.
- **Device:** his **Android phone, Chrome**. Every Clinic OS screen is designed for one-handed phone use first.
- **Goal:** make it effortless to **record visits and money** during a busy day, so he can **analyse the practice** later. He talks; the app does the paperwork.

## Clinic facts the app must respect

- **Hours (same as the Google Business Profile):** 8:30 AM–1:00 PM and 2:30 PM–7:30 PM, every day **except Friday** (closed). Open Sundays. Lunch 1:00–2:30. Calendar appointments are **40-minute blocks** starting 8:30 to 12:30 and 2:30 to 7:10 (15 a day); the last block of each session may run a few minutes past closing.
- **Timezone:** India (Asia/Kolkata), whatever the server timezone.
- **Price list:** `treatments` in `src/config/site.ts`, the same list the public website shows. **One price list for the website and the app.** Some prices are ranges (e.g. aligners `45,000/- to 65,000/-`) or formulas (`1,200/- + 400/-* number of additional teeth`); never strip digits blindly.
- **UPI ID for payment QR codes:** `rahil.yusuf.k-1@okhdfcbank` (payee name "Smile Dental Clinic").
- **Clinic WhatsApp:** `siteConfig.whatsapp`.

## Design principles

1. **Speak, don't type.** Free-form notes by dictation or keyboard. No clinical forms, dropdowns or tooth charts.
2. **Confirm, don't fill.** The app (Claude) turns notes and photos into structured data; the doctor checks a one-screen summary and taps **Confirm**.
3. **One tap for everything outgoing.** WhatsApp messages open pre-filled (`wa.me`); he taps Send. No WhatsApp Business API.
4. **Keep the original.** Raw dictation and photos are never thrown away when the app tidies or extracts.
5. **Small app.** Home has three things: **Today**, **+ Patient**, **Money**. One screen per patient.
6. **English (India).** Dictation and wording use `en-IN`.

## The patient journey (decided)

| # | Step | How it is captured |
|---|---|---|
| 0 | Before the visit: website booking, phone/WhatsApp, or walk-in | **Website:** the patient picks a free 40-minute block (at least 2 hours ahead, before 7 PM; evenings by phone), types the same details as a walk-in, and the request is saved and sent to the clinic's WhatsApp with a private link. In Clinic OS it appears on Today; Dr. Rahil opens it, slides the name into a block (or leaves it) and taps Save; the patient's WhatsApp confirmation opens ready to send. **Phone bookings** and time off are done on the Calendar tab. Walk-ins are added directly. |
| 1 | Arrival and intake: name, date of birth, address, WhatsApp number, medical alerts, how they heard about us | **Typed** (no mic on this screen, by request). Returning patients are found by phone number. |
| 2 | Examination and diagnosis | One **free-form note**, dictated or typed |
| 3 | Treatment plan, quote and consent | Same free-form note |
| 4 | Procedure | Same free-form note |
| 5 | Prescription and aftercare | **Photos** of the handwritten slip (and external X-rays / CT scans), each with a caption, **or** dictated |
| 6 | Next appointment | **Dictated** ("come back Thursday 15th, 6 PM") |
| 7 | Payment | **Dictated, or simple fields:** Amount collected + either **Balance next visit** or **Advance collected** + Submit. Extra charge lines can be added and edited. Amount → **UPI QR on screen** (amount pre-filled) or **Collected cash** button. Doctor confirms receipt. |
| 8 | WhatsApp to patient | **One message**: today's bill + prescription + next appointment (+ a private link to view the bill and prescription photo) |
| 9 | Reminder the evening before the next visit | Shown in a **"To send today"** list; one tap each (no automatic sending) |

**Return-visit loop:** open patient → dictate → confirm → collect → WhatsApp. Nothing else.

**Worked example** (used throughout design): Prakash Shetty, 38, walk-in with lower-right molar pain. Deep caries on 46, symptomatic irreversible pulpitis. Plan: RCT (₹3,500) → post and core (₹1,200) → crown (type undecided, ₹3,499–9,999). Visit 1 bill ₹4,200 (consultation 200 + X-ray 350 + RCT 3,500 + an unlabelled ₹150 extra line), paid by UPI. Visit 2: chose Ivoclar zirconia (₹7,499), paid ₹3,000 advance.

## The doctor's side

- **Expenses, entered at the end of the day:** form with addable lines (payee, category, amount) **plus** a bill photo **or** dictation ("Paid Dentcare lab 2,800 for Prakash's crown"); the app reads amount, payee, category and linked patient. Fixed monthly costs (rent, salary) are suggested each month for one-tap confirmation.
- **Daily close:** patients seen, collected by UPI vs cash, cash expenses, **cash expected in the drawer** vs counted, then Close day (summary can be sent to his own WhatsApp with one tap).
- **Insights (patients rarely owe money, so don't centre on dues):** profit (income − expenses) vs last month; profit per treatment (e.g. crown fee − lab bill); earnings per chair-hour; busiest days/hours heatmap; new vs returning; where new patients came from; patients by locality; **unfinished treatments** (e.g. RCT done, crown never booked); which options patients choose; extra charges that recur (candidates for the price list); expense trends; recalls due (6-monthly cleaning).
- **Ask in plain English:** "How much did I make from RCTs in October vs September?"
- **Monday summary** of last week, shown in the app.

## Smart features (the "make it intelligent" list)

1. Dictation/typing → Claude turns the note into a **tidy clinical note** (sections, punctuation, dental terms, FDI tooth numbers) + **structured data**, confirmed with one tap.
2. **Reads photos:** handwritten prescriptions; expense bills.
3. **Safety checks:** tooth number vs complaint side (e.g. "24" but "lower right" → did you mean 46?); allergy vs prescribed drug (penicillin allergy + amoxicillin); medical alerts at the top of every visit.
4. **Plans and bills fill themselves** from the price list; undecided options stay a range; non-list charges become editable extra lines.
5. **Next-visit suggestions** from "review in 5–7 days" + patient's preferred times + clinic hours.
6. **WhatsApp follow-up** via the one-tap list: visit message, reminders, crown nudges, recalls.
7. **Daily close** reconciliation.
8. **Insights** + plain-English questions.

## Screens and flow (rework, decided 2026-10-11)

The app grew cluttered after online booking and billing, so the structure is simplified. One rule: **every screen has one obvious next action.**

**Navigation:** two tabs, **Today** and **Patients**, plus a **+** button (New patient, Book appointment). A **⋯ menu** in the header holds the rare things: Practice mode, Delete test data, Sign out. Money returns as a tab only when it exists.

**Today is the day sheet.** It is also the calendar: a day strip and arrows move between days, and today is the default.
- **Needs you:** booking requests as cards with **Confirm** (books the time asked for, creates or links the patient, opens the WhatsApp confirmation) and **Other time**; later also unpaid balances and reminders.
- **Schedule:** the day's appointments in time order, then the free times as a compact grid of pills (tap one to book).
- **Seen today:** visits, with their state (in progress, billed, paid, done).

**A visit is one guided flow with three steps: Notes, Bill, Send.**
1. **Notes:** dictate or type, photos (prescription, X-ray). Later the smart-notes "Tidy up and confirm" lives here.
2. **Bill:** compact lines; **+ Add charge** opens on tap; payment buttons; the UPI QR shows on tap.
3. **Send:** **one WhatsApp message** with the bill, the next appointment (a suggested time, adjustable) and a link to the **prescription photo**; then Done.

**The patient page is a hub** with one smart primary button: *Start visit* (appointment today), *Bill and finish* (visit in progress), *Collect ₹X* (money owed), or *Book next visit* (all done). It shows the next appointment.

**One time picker** (compact pills; day strip; tap or slide) is used for Other time, next visit, phone booking and moving an appointment.

**Practice mode** (⋯ menu) marks every new patient and booking as TEST; **Delete test data** clears them. There is no per-patient checkbox.

## Decision log

- 2026-10-09 Keep the existing website and assets; discard the old Clinic OS entirely; start with **no data import**. (Old test data sits in a private `old_clinic_os` schema in the *old* Supabase project; it can be deleted.)
- 2026-10-10 Notes are free-form (dictation or keyboard), extracted by AI for one-tap confirmation. Dr. Rahil dictates in **English**.
- 2026-10-10 **One-tap WhatsApp** (no Business API, so nothing sends automatically). **Single user.** **Phone first.** Privacy disclosure for AI processing accepted.
- 2026-10-10 **Plain UPI QR** from the clinic UPI ID with the amount pre-filled; no payment gateway; doctor confirms receipt.
- 2026-10-10 Sign-in is **email + password** via Supabase (Google was attempted but the Google console was unresponsive; may be added later). Sessions persist until Sign out.
- 2026-10-10 Visits support **multiple photos with captions**. Camera and gallery are separate buttons (Android opens only the gallery when multiple selection is allowed).
- 2026-10-10 No mic on the patient-details screen (typing is easier). Dictation **stays on until Stop**, with an animation.
- 2026-10-11 **Online booking and calendar (Phase 5a).** Website SOS button removed. 40-minute blocks following the Google Business Profile hours (15 a day; the last of each session may overrun closing slightly; the 7:10 PM block is by phone only), Fridays closed. Patients may book only blocks starting **2+ hours ahead**; anything from **7 PM**, or a time not shown, is by phone. The website's how-did-you-hear answer is pre-filled from the link the visitor came from. Patient is told confirmation takes **under 15 minutes** (after 6 AM if requested between 9 PM and 6 AM). The request carries a private link into Clinic OS (a vCard is not possible from a WhatsApp link). Confirmation to the patient stays **one tap** on WhatsApp (Business API deferred).
- 2026-10-11 **Rework of flow and navigation** (see "Screens and flow"). Today and Calendar merged into one day sheet; visits become a three-step flow (Notes, Bill, Send); one combined WhatsApp message with the bill, next appointment and a private link to the prescription photo; one-tap Confirm on booking requests; Practice mode replaces the per-patient Test box; Money hidden until built. Built on a branch with a preview before merging.
- 2026-10-11 **Gender** is asked for every new patient and on the website booking form (female / male / other; required on both, optional in the database for older patients). It is shown beside the age in the clinic app and gives the smart note context. It is **never put in a WhatsApp message**. Likely later uses: analytics by age and gender, pregnancy and paediatric prompts.
- 2026-10-11 **Gemini is the AI until Claude access is available** (`AI_PROVIDER` switches back to `claude`; Claude Haiku 5.5 stays configured). Live summaries use **gemini-3.8-flash**; dictation uses the **phone browser's own speech recognition**, on until Stop (silence switch-off after 15 minutes). A live Gemini transcription stream (gemini-3.5-transcribe-live) was built and tested, then removed at the owner's request; it is in git history at commit ff67bc4. Owner accepted using Google's **free tier** for the one-week demo and referral onboarding, on these terms: name, address, phone and email are **replaced by placeholders before a note is sent** and put back on return; the worked example in the prompt keeps every answer in the same shape (for analytics); the doctor's original words are saved in `visits.notes_original` before anything is sent; real patient data moves to a paid-tier key before wider use. Dictation audio cannot be anonymised, so the screen tells the doctor he need not say the patient's name.
- 2026-10-11 **Simplification** (fresh-eyes review, [SIMPLIFY.md](SIMPLIFY.md); build progress in [BUILD_LOG.md](BUILD_LOG.md)). Owner said yes to all five: **one visit page** instead of the Notes / Bill / Send tabs; **"Tidy up with AI" removed** for launch (code kept in git history); **age instead of date of birth**, stored as birth year, in the app and on the website; **Practice mode, "Delete test data" and TEST badges removed** (trial data erased once at go-live); **shorter website booking** (no review page; only phone, name, gender and reason required). Target app: six screens (Today, Patients, New patient, Patient, Visit, Pick a time).
