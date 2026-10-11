# Simplify Clinic OS

*Fresh-eyes review, 11 October 2026. Written for the owner. File names and line numbers in `code font` are for the builders; you can skip them.*

**Evidence used.** A scripted walkthrough of every daily job on a OnePlus 13-sized Android screen (412×905, touch, Android Chrome). Its screenshots (`01-site-home.png` to `44-visit-notes-after.png`) and measurements (`tour.json`) sit in the session scratchpad folder `tour3/`. I also read every Clinic OS screen, server action, data file and SQL file, and ran the automatic checks: type check clean, 203 unit tests passing, lint clean. The walkthrough recorded no failures and no console errors. **The app works. The problem is how much it asks of the doctor.**

---

## 1. Verdict

Clinic OS already does every daily job, but it makes Dr. Rahil walk through too many screens and choose between too many ways of doing the same thing. A walk-in visit takes 15 taps over 5 screens: New patient, then a separate "New visit" page, then three tabs (Notes, Bill, Send) that each end in a "Next" button. Several jobs have two or three doors: search on Today and on Patients; book from "+", from Today and from the patient page; drag a name or tap a time. Some extras get in the way: "Tidy up with AI" hung for over 75 seconds, a next visit gets booked unless he spots a tiny "None", and a practice-mode banner sits on every screen. On Android the Back gesture does not follow what he sees: from the bill it jumped back to the New patient form.

**The single biggest change: make a visit one page.** "Start visit" opens it at once. Notes, photos, bill, payment, next visit and the WhatsApp button are all on that page, and it saves by itself. With the other changes below, a walk-in drops to about 10 taps and 3 screens, and a booked patient's whole visit from about 10 taps to 5–7.

---

## 2. The target app

### Screens: six, plus sign-in

| Screen | Daily jobs it serves | What it replaces |
|---|---|---|
| **Today** | See the day; confirm website requests; collect money owed; start a booked patient's visit; book a free time; close a day for a holiday | Today, without its search box; "appointments" and "seen" become one list |
| **Patients** | Find a patient (results appear while typing a name or phone); sign out at the bottom | The Patients tab and Today's search box |
| **New patient** | Add a walk-in, ending in "Start visit". The same form edits a patient's details | New patient, Edit details |
| **Patient** | Everything about one person: Start visit, Collect ₹X, Book appointment, coming appointments (Move, Cancel), past visits | The patient page with its changing "smart" button |
| **Visit** | Notes (type or dictate), photos, bill, payment, next visit and one WhatsApp message, on one page | The "New visit" page plus the Notes, Bill and Send tabs |
| **Pick a time** | One time picker for a phone booking, for "Other time" on a website request, and for moving an appointment | The two-step booking page, the request page and the move page (three look-alikes, one with dragging) |

**Gone:** the "+" pop-up, the ⋯ menu and the Practice-mode banner, the visit's own ⋯ menu, "Tidy up with AI" (if decision 2 is yes), and two pages that only redirect.

### Daily jobs: today versus target

"Today" numbers are measured (`tour.json` → `jobs`). "Target" numbers are my estimates for the app after the changes in section 3.

| Job | Today | Target | Changes that do it |
|---|---|---|---|
| Walk-in: new patient, notes, photo, bill, part payment, WhatsApp with next visit | 15 taps, 10 typed fields, 1 calendar picker, 5 screens | about 10 taps, 7 typed, no picker, 3 screens (New patient, Visit, WhatsApp) | C1, C6, C7, C9, C16 |
| Booked patient: start, notes, bill, pay, send (not measured as one job; counted from the screens) | about 10 taps, 3 screens + WhatsApp (patient page, New visit, visit tabs) | 5–7 taps, 1 screen + WhatsApp ("Start" on Today's row) | C1, C11 |
| Find a patient by phone | 3 taps, 1 typed, 3 screens | 2 taps, 1 typed, 2 screens | C10 |
| Collect money still owed | 2 taps, 2 screens | 2 taps, 2 screens (keep); it lands on the visit's payment part and says "Paid in full" | C1, C7 |
| Phone booking for a known patient | 6 taps + 1 to send WhatsApp, 1 typed | 3–4 taps: tap a free time, tap the patient, Book (WhatsApp opens) | C10, C12, C17, C18 |
| Website request, time asked | 1 tap | 1 tap (keep) | — |
| Website request, other time | 3 taps; the asked time is not pre-chosen | 3 taps; the asked time is already chosen | C2, C14 |
| Move an appointment | 3 taps; the current time is not marked | 3 taps; the current time is marked | C2, C14 |
| Cancel an appointment | 1 tap + confirm | same (keep) | — |
| Patient books on the website | 6 taps (with Send), 4 typed, 1 calendar picker, 3 steps | about 4 taps, 2–3 typed, no picker, 2 steps | C19 |
| Tidy a note with AI | 1 tap, then over 75 seconds with no result | job removed (decision 2) | C3 |
| Practice mode, delete test data | menu + 2 taps | job removed (decision 4) | C13 |
| Finish visit, reopen visit | 1–2 taps | job removed: sending the WhatsApp is the end of a visit | C15 |

---

## 3. Changes, ranked by benefit to the user

Types: **Remove**, **Merge**, **Simplify**, **Fix**, **Android**, **Code**. Size: **S** = a few files; **M** = one screen or several small parts; **L** = a screen rebuilt. "48 dp" is Android's minimum comfortable size for a fingertip, about 9 mm. "History" is the list of places the Back gesture returns to. D1–D5 refer to the owner decisions in section 5.

### High benefit

| ID | Type | Change | Why (evidence) | Benefit | Size | Risk |
|---|---|---|---|---|---|---|
| C1 | Merge (D1) | **A visit is one page.** "Start visit" opens it straight away; there is no "New visit" page. In order: notes (with Dictate), photos, bill, payment, next visit, "Send on WhatsApp". Notes save by themselves about 2 seconds after typing stops and before any other button acts, with a small "Saved" line; the on-phone copy stays as a safety net. Photos upload the moment they are taken. No tabs, no "Next" or "Back" buttons. Pressing "Start visit" twice never makes two visits, and a visit with nothing in it is not listed anywhere. A small "Delete visit" at the very bottom replaces the visit's ⋯ menu. | Walk-in today: 5 screens, 15 taps (`tour.json`, job A). Two different note editors for one job: "New visit" puts notes first, the Notes tab puts photos first (`12-visit-new.png` vs `15-smart-note-failed.png`). "Next: Bill" stays grey until something is typed (`12-visit-new.png`). Tabs change without a history entry, so Back skips them (`VisitFlow.tsx:50-56`). New photos wait in memory until "Next" is pressed, so they are lost if Android closes the tab (`VisitEditor.tsx:139-157`). | High | L | Medium: the biggest rebuild; saving by itself must cope with weak clinic internet |
| C2 | Fix | **Time pickers start on the right time.** For "Other time" on a website request, the time the patient asked for is already chosen; for "Move", the current time is marked. Save works at once. | The picker compares two spellings of the same moment as text, the database's `…+00:00` and the app's `….000Z`, so they never match (`SlotScheduler.tsx:36`; `requests/[id]/page.tsx:86`; `appointments/[id]/move/page.tsx:35`; `schedule.ts:24`). Seen in `28-move-page.png` and `39-request-page.png`: nothing chosen, Save grey. PRODUCT.md promises the name "already in the requested block". | High | S | Low |
| C3 | Remove (D2) | **Take "Tidy up with AI" out for launch.** If the owner keeps it instead: switch to a model that answers, turn off the library's hidden retries, give up after 25 seconds with a clear message, and move to a paid key before real patients. | It showed "Tidying up…" for over 75 s with no result and no message (`15-smart-note-failed.png`; `tour.json` job A). Cause: the app sets 40 s per try (`gemini.ts:78`), but the Google library silently retries a timed-out call 4 more times (`node_modules/@google/genai/dist/node/index.mjs:22177-22191` default retry policy, `:19313-19316` timeouts count as retryable): worst case about 3½ minutes; on Vercel the 60-second page limit cuts it off with a vague error. The chosen model, gemini-3.8-flash (`gemini.ts:8`), timed out all day on the free tier, while gemini-3.6-flash, 3.5-flash and 3.5-flash-lite answered in 1–3 s (coordinator's test, 11 Oct). Most of what it extracts is never used: medicines, next visit, preferred times, and a treatment plan saved to a table nothing reads (`smart-notes.ts:137-167`). About 1,270 lines of app code and 780 of tests. Free-tier AI for patient data goes against BUILD_PLAN.md §7. | High | S | Low: the code stays in git history, like the live dictation (commit `ff67bc4`) |
| C4 | Fix | **No next visit unless the doctor asks for one.** Show "Next visit: none" with one tap on the suggestion ("Book Sun 18 Oct, 8:30 AM") or "Pick another time". Work the suggestion out only when it is shown. | Today a time is pre-filled and booked on sending unless the tiny "None" (30×16 px) is tapped (`VisitSendStep.tsx:30`, `:143`; `lib/next-visit.ts:3-8`). In the walkthrough the note said "Review Thursday evening", yet the app booked Sun 18 Oct, 8:30 AM (`20-visit-send.png`; `tour.json` → `messages.visit-message`). That wrong slot then shows on the patient page (`27-patient-hub.png`) and disappears from the website. | High | S | Low |
| C5 | Android | **Back always goes back to what the doctor last saw.** Opening a visit from New patient replaces the form in the history. Anything that pops up (price list, QR, menus) closes on Back, as the photo viewer already does (`PhotoGallery.tsx:11-24`). A half-typed New patient form is kept until it is saved. | Back from the bill reopened the New patient form, inviting a duplicate patient; Back with the "+" pop-up or the ⋯ menu open left the page; Back on a half-typed form lost the typing (`tour.json` → `back`). Code: `patients.ts:57` adds the New visit page, then `VisitEditor.tsx:221` swaps it for the visit; `BottomNav.tsx:14-42` and `HeaderMenu.tsx:24-104` keep open/closed only on screen; `PatientForm.tsx:21-23` wipes the form when hidden. | High | S | Low |
| C6 | Simplify | **Add a charge with one tap.** "Add charge" opens the clinic price list with a filter box at the top. Tapping a fixed-price item adds it; a price range asks for the agreed amount; "Other charge" asks what for and how much. | Today: three fields and a button (search, "What for", "Amount", "Add to bill") (`17-add-charge-open.png`; `BillTools.tsx:111-148`). The search is one of the 10 typed fields of the walk-in. Most items have one fixed price in `src/config/site.ts`. | High | S | Low |
| C7 | Simplify | **Take payment with two big buttons.** "Cash received" records the amount. "UPI" fills the screen with the QR for the amount, with "Payment received" under it; Back closes it. One payment card (amount, payments so far, balance, the two buttons) instead of two cards. | The QR hides behind "Show UPI QR"; "Hide QR" is 46×16 px; "Open in a UPI app on this phone" makes no sense, because the patient pays from their own phone (`18-upi-qr.png`; `BillTools.tsx:240-267`). Payments and "Collect payment" are two cards for one job (`19-visit-bill-part-paid.png`; `VisitBillStep.tsx:44-85`). | High | S | Low |
| C8 | Simplify | **Patient page: the same main button every time.** "Start visit" (or "Open today's visit") always first; a red "Collect ₹X" only when money is owed; "Book appointment" below. | Today one "smart" button switches between five labels. For a returning walk-in with nothing booked it says "Book next visit" and shrinks "New visit" to a thin text link (`31-patient-hub-after-cancel.png`; `next-action.ts:41-43`; "New visit (380×20)" in `tour.json`). | High | S | Low |
| C9 | Simplify (D3) | **A quicker New patient form.** Age in years on the number keypad, no calendar. "How did they hear" as chips only. Only name and gender required. "Start visit" stays grey until they are filled, and any error shows just above it. Names get a capital letter on each word. | The Android calendar is the slowest field (`tour.json`: 1 picker in job A; choosing a 1980s year means scrolling a long year list). The chip and a text box hold the same answer (`11-new-patient-filled.png`; `PatientForm.tsx:133`). Errors appear at the top of a 1.3-screen form, out of sight when the button is pressed (`PatientForm.tsx:60`). | High | M | Medium if age changes what is stored (D3) |

### Medium benefit

| ID | Type | Change | Why (evidence) | Benefit | Size | Risk |
|---|---|---|---|---|---|---|
| C10 | Remove | **One place to find a patient.** Remove the search box from Today. On Patients, results appear while typing; no Search button. The patient search on the booking page works the same way, and tapping a result row picks it. | Today's box only jumps to the Patients tab (`ui.tsx:26-34`; `app/app/page.tsx:78`): two identical boxes (`07-today-empty.png`, `25-patients-list.png`). Finding a patient: 3 taps → 2. On the booking page: type, press Search, then hit a 13×13 radio button (`33-book-2-who.png`; `book/page.tsx:66-71`). | Medium | S | Low |
| C11 | Merge | **Today: one list of today's patients,** in time order: booked, in the chair, finished. Each of today's booked rows has a "Start" button that opens the visit. | A patient being seen shows twice, under "1 appointment" and "2 seen" (`37-today-with-request.png`; `app/app/page.tsx:122-177`). Reaching a booked patient's notes takes 2 taps and 2 screens. | Medium | M | Low |
| C12 | Remove | **"+" opens New patient directly.** Drop the pop-up with "Book an appointment"; booking stays where the time is chosen: Today's free times and the patient page. | Two ways to book; the pop-up costs a tap, and Back left the page instead of closing it (`09-add-sheet.png`; `tour.json` → `back`). | Medium | S | Low |
| C13 | Remove (D4) | **Remove Practice mode, "Delete test data", the TEST badges and the ⋯ menu.** Practise until go-live, then erase trial data once (`supabase/reset-all-data.sql`). Sign out moves to the bottom of Patients. Drop the top bar once it holds nothing but the logo; each screen has its own title. | A yellow banner on every screen and TEST badges on every card (`10-new-patient-empty.png` to `40-request-picked.png`); a menu of three rare items (`08-menu-open.png`). The automatic tests already use their own login. Frees about 90 px of height on every screen. | Medium | M | Low–Medium: the tests' clean-up must change |
| C14 | Remove | **Tap a time; no dragging.** Remove the "slide the name into a block" chip from the time pickers. Make the Save bar solid so the times never show through it. | Two ways to do one thing, plus an instruction line (`28-move-page.png`, `39-request-page.png`; `SlotScheduler.tsx:43-81`, `183-195`, `226-232`). The drag is not covered by the automatic tests (BUILD_PLAN.md, Phase 5a "Known limits"). The see-through Save bar covers the 12:30 PM time (`39-request-page.png`; `SlotScheduler.tsx:213-224`). | Medium | S | Low |
| C15 | Simplify | **Two plain facts instead of four visit states.** Each visit shows money (Paid, ₹X due, or No bill) and "WhatsApp sent". Remove "Finish without sending", "Reopen" and the "Visit done" box. | "Done" next to "₹500 due" says two different things (`22-today-after-visit.png`). Four states in `lib/visit-status.ts`; the extra buttons in `VisitSendStep.tsx:76-105`, `193-203`. | Medium | M | Medium: "finished" is used by Today, the patient page and the visit |
| C16 | Simplify | **A shorter Send part.** No copy of the message on screen: WhatsApp shows it before Send. Under each new photo, one tap marks it Prescription, X-ray or Other, instead of typing a caption. Prescription photos are pre-ticked to send. | The message box repeats WhatsApp (`20-visit-send-full.png`; `VisitSendStep.tsx:175-180`). The caption box is 36 px tall with 14 px text (`VisitEditor.tsx:287-289`). The x-ray was not ticked, and the message calls any photo "Prescription photo" (`lib/billing.ts:80-85`). | Medium | S | Low |
| C17 | Android | **WhatsApp opens reliably and Back comes home.** Open WhatsApp from a real tap on a link where possible; where it opens by itself after saving, always leave a big "Open WhatsApp" button. Test on the OnePlus in Chrome and in the home-screen app. | The walkthrough used a stand-in page (`21-whatsapp-handoff.png`), so this is unproven on a real phone. Three screens open WhatsApp from code after a server call (`RequestCard.tsx:40`, `SlotScheduler.tsx:98`, `VisitSendStep.tsx:72`); phone booking waits for a tap instead (`BookAppointment.tsx:54-58`). | Medium | S | Low |
| C18 | Android | **Every button and field at least 48 dp.** Patient choices become big rows (no tiny radio buttons). | 54 different Clinic OS controls are smaller (91 across the site; `tour.json` → `shots`). Worst: patient radio 13×13 (`33-book-2-who.png`), photo tick box 20×20, "Back to today" 79×14, "Change" 44×16, "None" 30×16, "Hide QR" 46×16, close X 24×24, bin icons 32×32, Dictate 103×36, chips 32–36 px tall. | Medium | S | Low |
| C19 | Simplify (D5) | **A shorter website booking.** Remove the "Looks good?" review step; the details page ends in "Send on WhatsApp". Require only phone, name, gender and reason; age, address, medical alerts and a note are optional. Fix the cut-off "TOMORROW" label. 48 dp time buttons and chips. | The review repeats what was just typed, and WhatsApp shows the message again (`05-site-book-3-review.png`, with the date written `1990-05-15`). The details step is 2.9 screens tall with a calendar picker (`03-site-book-2-details-full.png`). "TOMORROV" is cut off (`02-site-book-1-times.png`). Time buttons are 44 px, chips 36 px (`tour.json`). | Medium | S | Low |
| C20 | Simplify | **A short prescription link (optional; the only new page).** One short link to a small page showing the ticked photos, instead of a 620-character storage address. | 70% of the 890-character visit message is the photo link, which also exposes internal IDs (`tour.json` → `messages.visit-message`; `actions/visits.ts:121-138`). Already planned (BUILD_PLAN.md, Phase 4a); the `share_links` table exists and is unused. Needs a server-only secret key in Vercel (owner). | Medium | M | Medium: a public page with patient photos must expire and be unguessable |

### Low benefit

| ID | Type | Change | Why (evidence) | Benefit | Size | Risk |
|---|---|---|---|---|---|---|
| C21 | Simplify | **Small wording and layout fixes.** Today: one date line instead of two; remove "Back to today" (the strip's first chip is Today); "1 bkd" → "1 booked"; money owed only when viewing today. Patient page: Move and Cancel side by side instead of a full-width red Cancel. "Back to calendar" → "Back to Today". The "moved" WhatsApp says "has been moved to", not "is confirmed ✅". | Date shown twice and a 79×14 px link (`41-today-friday-closed.png`, `42-day-sheet-future.png`; `app/app/page.tsx:51-53`); cryptic "bkd" (`:71`); dues listed on every day (`:106-118`); red Cancel (`27-patient-hub.png`); no calendar exists any more (`BookAppointment.tsx:62`; `36-book-4-booked.png`); move message (`tour.json` → `messages.move-message`; `actions/appointments.ts:183`). | Low | S | Low |

### Code clean-up (no visible change, less to maintain)

| ID | Type | Change | Why (evidence) | Benefit | Size | Risk |
|---|---|---|---|---|---|---|
| C22 | Code | **Delete pages that only redirect:** `/app/appointments/[id]`, `/app/visits/[id]/bill`, and the `/app/calendar` redirects. | Nothing in the app links to them, and nobody has old bookmarks: the app is not in daily use (`next.config.ts:9-15`). | Low | S | Low |
| C23 | Code | **Delete unused database tables and columns.** Tables: `reminder_log`, `expenses`, `recurring_expenses`, `day_closes`, `share_links` (unless C20), and the `expense-receipts` photo store. With C3: `treatment_items`, `visits.summary`, `notes_original`, `confirmed_at`, `patients.preferred_times`. With C13: `is_test`. Also `booking_requests.area`, `city`, `preferred_date`, `preferred_time`, `is_emergency` (together with a new `submit_booking_request`, which still fills them), `appointments.reminder_sent_at`, `visit_charges.treatment_item_id`, `payments.kind` and `reference`. | No code in `src/` uses them (searched). Defined in `phase3-5.sql`: `share_links` line 117, `reminder_log` 201, `recurring_expenses` 214, `expenses` 236, `day_closes` 268, the receipts store 591-608. Keep `app_config`: the booking functions use it. | Low | M | Medium: run on the live database after clinic hours, with a backup |
| C24 | Code | **One schema file.** Replace the seven layered SQL files with `schema.sql` (the database after C23) plus one dated clean-up script. Delete `archive-old-clinic-os.sql` (it was for the old project) and, after go-live, `reset-all-data.sql`. Update `supabase/tests/booking.check.mjs`. | Today a fresh setup means running `phase2`, `phase3-5`, `patch-test-flag`, `patch-booking`, `patch-booking-hours`, `patch-gender` and `patch-visit-flow` in the right order. | Low | M | Low |
| C25 | Code | **Remove dead code and files.** Row types for unused tables (`types.ts:108-116`, `181-255`); `activeModel` (`ai/provider.ts`); the unused `fromVisitId` (`actions/appointments.ts:87`); a second copy of the photo store name (`VisitEditor.tsx:14`); the Claude/Gemini switch if only one AI stays; `public/images/dr_rahil_action.jpg` and `dr_rahil_portrait.jpg` (byte-identical, unused copies of two other photos); stale comments (`schedule.ts:61` "all 16" blocks, there are 15; "Claude" in `VisitNotesStep.tsx:12`, `SmartNoteCard.tsx:25`); four leftover agent worktrees and their branches. | Searches of `src/`; file sizes; `git worktree list`. | Low | S | Low |
| C26 | Code | **Docs that match the app.** Rewrite PRODUCT.md's "Screens and flow" and add the decisions; cut BUILD_PLAN.md down to status and what is left; point AGENTS.md at this plan; fix README (it promises expenses) and `.env.example` (it mentions live dictation, which was removed). | BUILD_PLAN.md still describes a Calendar tab and a Money tab (line 77), shows done Wave 0 items as not done (lines 41-44), and says "Claude Haiku" and "never free tier" (line 216) against PRODUCT.md's Gemini free-tier decision (line 101). PRODUCT.md principle 5 still lists "Today, + Patient, Money" (line 26). | Low | S | Low |
| C27 | Code | **Fewer database calls per tap.** Read money owed with one summed query instead of loading every visit ever, and stop reloading what did not change. | Each charge or payment reloads the whole visit: about 10 queries, including re-signing every photo link and recomputing the next-visit suggestion. Today reads all visits with charges on every load (`data/dues.ts:16-24`): fine now, slow in a year. | Low | S | Low |

---

## 4. Keep as is

- **One-tap Confirm** for website requests on Today: it books the asked time, creates or links the patient, and opens the patient's WhatsApp confirmation (`37-today-with-request.png`; `tour.json` job D: 1 tap).
- **Booking rules enforced by the database:** 2 hours' notice, nothing from 7 PM, Fridays closed, no double booking, limits per phone. Checked by `supabase/tests/booking.check.mjs`.
- **The red medical alert** at the top of every patient, visit and request screen (`12-visit-new.png`, `39-request-page.png`).
- **The returning-patient check** as soon as a full phone number is typed on New patient.
- **Dictation that stays on until Stop** and keeps the screen awake, and **notes kept on the phone** if Android closes the tab while the camera is open.
- **Separate Take photo and Gallery buttons** (Android opens only the gallery when several photos may be picked).
- **The UPI QR for the exact amount,** with the amount pre-filled from what is owed, and the doctor confirming receipt himself.
- **One price list** for the website and the app (`src/config/site.ts`), with careful reading of ranges and formulas (`src/lib/pricing.ts`).
- **India time everywhere** and the 15 forty-minute blocks (`src/lib/schedule.ts`, `src/lib/dates.ts`).
- **The day strip on Today** with Fridays marked "off" (`41-today-friday-closed.png`), plus "Close this day" and "Block this time", which keep the website's free times honest.
- **The one WhatsApp message:** short, clear, and never mentions gender (`tour.json` → `messages`).
- **The security basics:** every screen and action checks the doctor's sign-in (`getDoctor()`), only one email may sign in, every table is limited to its owner, photos are private.
- **The photo viewer, where Back closes it** (`PhotoGallery.tsx:11-24`): the pattern to copy for every pop-up.
- **The safety nets:** the "This screen didn't load / Try again" page (`src/app/app/error.tsx`), and saves that can be retried without creating a second visit or photo.
- **The quality gates:** 203 unit tests, type check and lint, all clean today.

---

## 5. Owner decisions needed

1. **One visit page instead of three tabs (C1, C15)?** **Recommendation: yes.** It removes a screen, two "Next" taps per visit and the Back-gesture trap, and puts "Collect" and "Send" one scroll away. The three-tab flow was chosen earlier today; the walkthrough shows it adds steps rather than removing them. *If no:* keep the tabs, but make each tab change a step that Back returns to, and still remove the separate "New visit" page.

2. **Take "Tidy up with AI" out for launch (C3)?** **Recommendation: yes, remove it.** It can come back from git history, as the live dictation could. It failed in the walkthrough; it runs on Google's free tier, which you accepted only for the demo week and the build plan rules out for real patient data; and most of what it produces is never used. Billing gets quicker without it, through one-tap charges from the price list (C6). *If no:* switch to a model that answered today (gemini-3.5-flash or gemini-3.6-flash), turn off the library's hidden retries, give up after 25 seconds with a clear message, and move to a paid key before real patients.

3. **Ask age instead of date of birth, in the clinic and on the website (C9, C19)?** **Recommendation: yes:** one or two digits on the number keypad, stored as the birth year. Dentistry needs the age, not the exact date, and the Android calendar is the slowest field on both forms. *If no:* keep the date of birth, but typed as digits (DD MM YYYY) on the number keypad instead of the calendar.

4. **Remove Practice mode and "Delete test data" (C13)?** **Recommendation: yes.** Practise freely until go-live, then erase all trial data once with `supabase/reset-all-data.sql`; the automatic tests already use their own login. This also removes the yellow banner, the TEST badges and the ⋯ menu.

5. **A shorter website booking (C19)?** **Recommendation: yes:** no "Looks good?" page, and only phone, name, gender and reason required (age, address, medical alerts and a note stay as optional fields). Patients see their message again in WhatsApp before sending, and Dr. Rahil checks the details at the first visit.

---

## 6. Build waves

Rules for every wave: at most two builders, each in its own worktree; within a wave, **no file is edited by both builders** (the lists below say who owns what). Shared files with one owner: `src/components/clinic/ui.tsx` (nobody in Wave 1, builder 2A in Wave 2), `src/lib/data/types.ts` (orchestrator in Wave 0, builder 1A in Wave 1, nobody in Wave 2, Wave 3 builder), `e2e/env.ts` (orchestrator), `package.json` (Wave 3 only). Each builder keeps the names and inputs of shared functions it does not own. Every wave ends with `npm test`, `npm run lint`, `npm run build` and its e2e file passing, then the phone check below on the OnePlus 13 (Chrome first, then the home-screen app). Database changes run after 7:30 PM IST.

### Wave 0: prepare (orchestrator only)

- Get the five decisions and record them in PRODUCT.md's decision log.
- Back up the database before any later database change.
- Split `e2e/clinic.spec.ts` into `e2e/visit.spec.ts`, `e2e/times.spec.ts`, `e2e/today.spec.ts` and `e2e/website.spec.ts`, each signing in and cleaning up its own data, so builders never share a test file.
- If decision 3 is yes: add the birth-year column to `patients` and `booking_requests`; let `submit_booking_request` and `confirm_booking_request` accept and copy it (keep `date_of_birth` until Wave 3); add the fields to `src/lib/data/types.ts` and one age/birth-year helper to `src/lib/dates.ts`.
- Push the base commit before creating worktrees.

**Done when:** the four new e2e files and all existing checks pass on the unchanged app.

### Wave 1: the visit page and the time pickers (two builders in parallel)

**Builder 1A – Visit.** Changes: C1, C3, C4, C6, C7, C16; the visit part of C5, C15 and C17; C18 on these screens.
Files only 1A edits:
- `src/app/app/visits/[id]/page.tsx`; delete `src/app/app/visits/[id]/bill/page.tsx` and `src/app/app/patients/[id]/visits/new/page.tsx`.
- In `src/components/clinic/`: `VisitFlow.tsx`, `VisitNotesStep.tsx`, `VisitBillStep.tsx`, `VisitSendStep.tsx`, `VisitEditor.tsx`, `VisitMenu.tsx`, `VisitStatusBadge.tsx`, `BillTools.tsx`, `NextVisitPicker.tsx`, `PhotoGallery.tsx`, `MicButton.tsx`, `SmartNoteCard.tsx`, and any new visit components.
- `src/lib/actions/visits.ts`, `billing.ts`, `smart-notes.ts`; `src/lib/data/visits.ts`, `billing.ts`, `next-visit.ts`; `src/lib/billing.ts`, `next-visit.ts`, `visit-status.ts`, `resize-image.ts`; `src/lib/ai/**`; `src/lib/data/types.ts` (visit types only).
- Small touch points: `src/lib/actions/patients.ts` (only `createPatient`: create the visit and open it, replacing the form in the history), `src/app/app/patients/[id]/page.tsx` (only the Start visit button) and `src/lib/next-action.ts` with its test (only the two links to the deleted "New visit" page, lines 34 and 44). `src/lib/data/patient-hub.ts` and `src/app/app/page.tsx` only if the visit-state helper changes shape.
- `e2e/visit.spec.ts` and the unit tests beside these files.

Phone check:
1. Today → + → New patient → fill it in → Start visit. One Visit page opens: no "New visit" page, no Notes/Bill/Send tabs.
2. Type a note and wait 2 seconds: "Saved" shows. Turn on aeroplane mode and type more: it says the note is kept on the phone. Turn it off: it saves.
3. Take a photo: it appears on the page by itself. Tap "Prescription" under it.
4. Add charge → tap "Scaling – Moderate case ₹600": the line and the total appear, with no typing.
5. Change the amount to 500 → Cash received: "Paid by cash ₹500", "₹100 due". Tap UPI: a full-screen QR; the Back gesture closes it; tap UPI again → Payment received.
6. Next visit shows "None". Tap the suggested time: it shows as booked.
7. Send on WhatsApp: WhatsApp opens on the patient's chat with the bill, the next visit and the photo link. Come back: the visit shows "WhatsApp sent".
8. The Back gesture from the visit goes to Today, never to the New patient form.
9. "Tidy up with AI" is gone (decision 2 yes), or answers or explains itself within 25 seconds (decision 2 no).

**Builder 1B – Time pickers and bookings.** Changes: C2, C14; the booking-page part of C10; the booking part of C17; the wording in C21; the routes in C22; C18 on these screens.
Files only 1B edits:
- In `src/components/clinic/`: `SlotScheduler.tsx`, `SlotGrid.tsx`, `BookAppointment.tsx`, `CalendarActions.tsx`, `RequestCard.tsx`.
- `src/app/app/book/page.tsx`, `src/app/app/requests/[id]/page.tsx`, `src/app/app/appointments/[id]/move/page.tsx`; delete `src/app/app/appointments/[id]/page.tsx`.
- `src/lib/actions/appointments.ts`; `src/lib/data/appointments.ts` (keep `getDaySchedule` and `getScheduleForDate` as they are: 1A uses them); `src/lib/schedule.ts`; `src/lib/whatsapp.ts`; `next.config.ts`.
- `e2e/times.spec.ts` and the tests for `schedule.ts` and `whatsapp.ts`.

Phone check:
1. A website request on Today → Other time: the asked time is already highlighted and "Save and confirm" is blue. Tap another time → Save → WhatsApp opens with the new time.
2. Patient page → Move: the current time is highlighted. Pick another → WhatsApp says the appointment "has been moved to" the new time.
3. No "slide the name" chip anywhere; while scrolling, the Save bar is solid.
4. Today → tap a free time → type four digits of a phone number → tap the patient's row → Book → WhatsApp opens; if it does not, a big "Open WhatsApp" button is there.
5. After booking, the link says "Back to Today".
6. `/app/calendar` and `/app/appointments/<id>` now show "not found" (expected).

### Wave 2: Today, patients and the website form (two builders in parallel)

**Builder 2A – Today, navigation and patients.** Changes: C8, C9, C11, C12, C13; the Today and Patients part of C10; the rest of C5, C15 and C21; C18 on these screens.
Files only 2A edits:
- `src/app/app/page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`.
- `src/app/app/patients/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`.
- In `src/components/clinic/`: `BottomNav.tsx`, `HeaderMenu.tsx`, `PatientForm.tsx`, `ui.tsx`, `useResetOnHide.ts`.
- `src/lib/actions/patients.ts`, `practice.ts`; `src/lib/practice.ts`, `next-action.ts` (delete); `src/lib/data/patients.ts`, `patient-hub.ts`, `dues.ts`.
- Only to remove the TEST badges and the practice flag (decision 4): `RequestCard.tsx`, `BookAppointment.tsx`, the visit header component, and `bookNewPatient` in `src/lib/actions/appointments.ts`.
- `e2e/today.spec.ts` and the unit tests beside these files.

Phone check:
1. Today shows one list of today's patients by time. A booked one has "Start", which opens its visit.
2. No search box on Today. On Patients, typing "9717" shows matches without a Search button.
3. "+" opens New patient at once. Type a name, use Back, open New patient again: the name is still there.
4. New patient: Age opens the number keypad (no calendar); "heard from" is chips only; tapping Start visit without a gender shows the message just above the button.
5. Patient page: "Start visit" always first; "Collect ₹X" only when money is owed; "Book appointment" below; Move and Cancel side by side.
6. No yellow banner, no ⋯ menu; Sign out sits at the bottom of Patients (decision 4).
7. Re-run the walkthrough script: no Clinic OS control below 48 dp, and the walk-in job takes about 10 taps over 3 screens.

**Builder 2B – Website booking.** Changes: C19 (and the website side of decision 3).
Files only 2B edits: `src/components/site/PublicBookingForm.tsx`, `src/app/(public)/book/page.tsx`, `src/lib/actions/booking.ts`, `e2e/website.spec.ts`. (`src/components/GenderChoice.tsx` is shared and stays as it is; the types were updated in Wave 0.)

Phone check, in Chrome at `/book`:
1. The "Tomorrow" label fits, and the time buttons and chips are easy to hit.
2. Tap a time → the details page: only phone, name, gender and reason are required; age uses the number keypad.
3. "Send on WhatsApp" is on the details page (no review page). WhatsApp opens with the message, the request appears on Today in Clinic OS, and its one-tap Confirm works.

### Wave 3: clean-up (one builder; the orchestrator runs the database script)

Changes: C22–C27, plus whatever is left of C3 and C13.
Files: `supabase/**` (a new `schema.sql`, one dated clean-up script, `tests/booking.check.mjs`); `src/lib/data/types.ts`; `package.json` and `package-lock.json` (remove `@google/genai` and `@anthropic-ai/sdk` if decision 2 is yes); delete `public/images/dr_rahil_action.jpg` and `dr_rahil_portrait.jpg`; `docs/PRODUCT.md`, `docs/BUILD_PLAN.md`, `README.md`, `SETUP.md`, `.env.example`, `AGENTS.md`; `src/lib/ai/provider.ts` (only if decision 2 is no).
Orchestrator: run the clean-up script on the live database after 7:30 PM IST with the Wave 0 backup at hand; remove the four old agent worktrees and their branches.

Check:
1. A fresh local database built from `schema.sql` passes `node supabase/tests/booking.check.mjs`.
2. On the phone, after the live clean-up: do every daily job once (walk-in, booked visit, collect, find, phone booking, website request Confirm and Other time, move, cancel) and make one booking on the website. Nothing errors.
3. A search of `src/` finds no use of the removed tables or columns, and all four e2e files pass.

### Wave 4: short prescription link (optional; C20)

Owner first: create a server-only secret key in Supabase and add it in Vercel (never paste it in chat).
Files: a new `src/app/r/[token]/page.tsx`; `src/lib/actions/visits.ts`; `src/lib/billing.ts`; `src/app/(public)/privacy/page.tsx`; the `share_links` part of `supabase/schema.sql`.

Check: the WhatsApp message holds one short link. On another phone, not signed in, it shows that visit's ticked photos and bill. After the expiry date it says the link has expired, and changing one letter of the link shows nothing.
