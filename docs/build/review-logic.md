# Logic review: money, visits, calendar and requests (fresh eyes)

*12 Oct 2026, `main` @ a0cf93f. Read: `AGENTS.md`, `docs/PRODUCT.md`, `docs/SIMPLIFY.md`, `docs/BUILD_LOG.md`, the whole of `supabase/schema.sql`, and every file in `src/lib/actions/`, `src/lib/data/`, `src/lib/*.ts`, `src/app/app/**` and `src/components/clinic/**`.*

*Proofs: each one ran in a throwaway PGlite database built from `schema.sql`, never the live one. They make the same writes the app makes, signed in as the doctor, so row-level security applies. The money proofs call the app's own `summarise`, `visitStatus` and `visitMessage`. The scripts are listed in the appendix. File names and line numbers in `code` are for the builders; the owner can skip them.*

## Verdict

The bug the owner found is one of a family. Two root causes break the money:

1. **The database lets money outlive its visit.** `payments.visit_id` is `on delete set null`.
2. **Each screen adds up the money its own way.**
   - Today: one visit at a time, only positive balances, only payments that belong to a visit.
   - Patient page: the whole patient, plus loose payments as an "advance".
   - Visit page: this visit only. Other visits are shown only when they owe money.
   - WhatsApp message: everything.

   The four agree only while nothing unusual has happened: no advance, no overpayment, no deleted visit.

So the app can show four different amounts for one patient, pre-fill the payment box with too much, and show "Collect ₹500" and "Advance with us ₹500" on the same screen. The same problem shows up outside money:
- An appointment the patient still has to come to gets marked "done", and its time is offered to someone else.
- A visit still says "WhatsApp sent" after the bill changed.
- One-tap Confirm can create a second record for a known patient. That record does not have their medical alert.
- A deleted photo can stay in storage.

**25 findings: 2 Blocker, 10 Should fix, 13 Nice to have.** The database changes fit in one migration (section 4). PGlite shows its six checks pass, and the existing 104-check booking suite still passes with it.

**The decision you asked for:** the app should **refuse** to delete a visit that holds money until its payments are removed (section 3).

---

## 1. Invariants

These rules must always hold. The findings refer to them by number.

**Patients**
1. One person has one patient record. Family members may share a phone, but the app never makes a second record for someone already in it without asking.
2. What a patient tells the clinic about their health (medical alerts) ends up on their record.
3. Removing a patient removes everything of theirs, photo files included. (The app has no Delete patient. Only the phone booking's own clean-up and the test clean-up delete patients.)

**Visits**
4. A patient has at most one visit per day. "Start visit" always reopens today's visit.
5. A visit's date is the India date on which it was started.
6. A visit with nothing in it is listed nowhere.
7. A visit that holds money (payments) cannot disappear by accident.
8. "WhatsApp sent" means the patient was handed a message with the visit's current bill and next appointment, and neither has changed since.

**Charges and payments**
9. Every charge and every payment belongs to a visit of the same patient. No payment floats free: an advance is money paid above a visit's bill, recorded on that visit.
10. Charges are ₹0 or more and payments more than ₹0, in whole paise, at most ₹10 lakh a line.
11. Money received is only removed one payment at a time, on purpose, with its amount named.

**Money on every screen**
12. What a patient owes = all their charges − all their payments. A positive amount is owed; a negative amount is an advance.
13. The parts owed on each visit add up to that amount. A payment pays its own visit first, then the oldest unpaid visit. Whatever is left over is an advance.
14. Today (Needs you and the visit rows), the patient page (Collect / Advance), the visit page (payment card and amount box) and the WhatsApp message show the same numbers (12, 13).
15. The amount box never pre-fills more than the patient owes. No screen shows "Collect" and "Advance" together, or "Collect" when nothing is owed.

**Photos**
16. Every photo row has its file in storage under `<doctor>/<visit>/`, and every file there has a row.
17. Once a photo, or a visit with photos, is deleted, nobody can open the photo again, even through a 30-day link sent earlier.

**Appointments**
18. No two booked appointments overlap.
19. A booked appointment starts on a clinic block, not on a Friday and not in blocked time. It was not already over when it was booked or moved.
20. "Done" means the patient came, so a done appointment has its visit. An appointment the patient still has to come to stays booked.
21. Today lists every booked appointment of the day until its own visit is listed instead.
22. The patient hears about every booking, move or cancellation the doctor makes (one tap on WhatsApp). The visit message names the next appointment as it stands.
23. Cancelling an appointment frees its time.

**Website requests**
24. A waiting request holds its time on the website until it is handled.
25. A booked request points at its patient and its appointment.
26. Confirm books only a time that is still ahead and free. It links the right patient, asking when the phone is already known. It always leaves the doctor a way to send the confirmation, even after a retry. Decline works the same way.

**Time off**
27. Blocked time never covers a booked appointment without the doctor being told.
28. Reopening a time removes exactly the time the doctor reopened.

**Share links**
29. A share link belongs to one visit and is deleted with it. (Nothing creates share links yet.)

**Everywhere**
30. A retry after a lost reply never doubles anything, and never leaves the doctor without the result (a WhatsApp link, an open visit).
31. A save that reaches nothing (for example, a deleted visit) says so instead of "Saved".

---

## 2. Findings

| # | Severity | Finding | Breaks | Fixed in |
|---|---|---|---|---|
| 1 | **Blocker** | Deleting a visit keeps its payments as loose rows. The patient page shows them as an advance, and they are subtracted from the next bill in WhatsApp only. | 7, 9, 11, 14 | Database, action, screen |
| 2 | **Blocker** | Money is added up four different ways. The visit page ignores advances and pre-fills too much. The patient page can say "Collect" and "Advance" together, or "Collect" when nothing is owed. | 12–15 | One shared rule, data, screens |
| 3 | Should fix | Send on WhatsApp marks the patient's later booking today as "done", and the website offers that time to someone else. | 20, 22 | Action |
| 4 | Should fix | Once one of a patient's visits is listed, Today hides all of their appointments that day. | 21 | Data, screen |
| 5 | Should fix | "WhatsApp sent" stays after the bill changes, and a second Send is not recorded. | 8 | Database, action, screens |
| 6 | Should fix | Changing the next visit after sending tells the patient nothing. | 8, 22 | Action, screen |
| 7 | Should fix | Delete photo and Delete visit remove the row first, and never check whether the file went. | 16, 17 | Action |
| 8 | Should fix | Duplicate patients, four ways: one-tap Confirm with another spelling of the name; Other time pre-selecting "New patient"; phone booking not checking the number; New patient saved twice after a lost reply. | 1, 2 | Actions, screens |
| 9 | Should fix | Linking a website request to a known patient drops the medical alert they typed. | 2 | Database |
| 10 | Should fix | Confirm or Decline retried after a lost reply only says "already handled", and the patient's message can then never be sent. | 26, 30 | Action |
| 11 | Should fix | "Close this day" works even when patients are booked that day. Nobody is warned, and the appointments stay booked. | 27 | Action |
| 12 | Should fix | "Reopen" on one blocked time inside a closed day reopens the whole day. | 28 | Action, screen |
| 13 | Nice to have | Deleting a sent visit leaves its appointment "done" with no visit. The delete question does not mention the next visit or the WhatsApp already sent. | 20 | Action, screen |
| 14 | Nice to have | Two visits for one patient on one day are possible. | 4 | Database, data |
| 15 | Nice to have | Confirm accepts a time that is already over. | 26 | Database |
| 16 | Nice to have | A screen left open can book, move or set the next visit into blocked time or the past. | 19 | Database |
| 17 | Nice to have | A waiting request holds its time for only 24 hours, and old requests stay in Needs you forever. | 24 | Screen |
| 18 | Nice to have | Notes saved to a deleted visit say "Saved". | 31 | Action |
| 19 | Nice to have | A ₹0 line reads three different ways. | 14 | Shared rule, message |
| 20 | Nice to have | On a slow Send, "WhatsApp sent" is recorded and shown before WhatsApp opens. | 8 | Screen, action |
| 21 | Nice to have | A photo that uploaded but was never recorded stays in storage. | 16 | Action |
| 22 | Nice to have | For a patient without a phone, the visit's appointment stays "booked" and is counted on the day strip. | 20 | Data |
| 23 | Nice to have | Delete visit and Book, retried after a lost reply, show an error for something that worked. | 30 | Actions |
| 24 | Nice to have | Cancel offers no message to the patient (Move does). | 22 | Action, screen |
| 25 | Nice to have | Deleting a patient outside the app leaves their photo files, and a booked request pointing at nothing. | 3, 16, 25 | Only if Delete patient is added |

### Blockers

#### 1. Deleting a visit turns its payments into a phantom advance (the owner's bug)
**Breaks:** 7, 9, 11, 14.

**On the phone**
1. Open a patient → Start visit. Add charge → any item (say ₹200). Payment → Cash received ₹200.
2. At the bottom, tap Delete visit → OK. The question says the payments are deleted. They are not.
3. The patient page now says "Advance with us: ₹200". Today says nothing.
4. Start visit again and add RCT ₹3,500. Now four screens disagree:
   - Payment card: "Still due ₹3,500", with ₹3,500 in the box.
   - Today: "₹3,500 due".
   - Patient page: "Collect ₹3,300".
   - The WhatsApp message: "Balance due ₹3,500 … Advance from other visits ₹200 … Total due ₹3,300".

**Evidence**
- `supabase/schema.sql:179`: `visit_id … on delete set null`. `actions/visits.ts:211` deletes the visit. `VisitFlow.tsx:138` promises the payments go with it.
- Each screen then treats the loose payment differently:
  - `data/patient-hub.ts:61` counts it as an advance (`:99-100`).
  - `data/dues.ts:32` ignores it (`visit_id not null`).
  - `data/billing.ts:37-47` subtracts it as "other visits".
  - `PaymentCard.tsx:99` shows other visits only when they owe.
- PGlite `logic-money.test.mjs` M1:
  - After deleting a visit with ₹550 paid, the payment row is kept with `visit_id null`. The patient page says "Advance with us: ₹550"; Today shows nothing.
  - Next visit, RCT ₹3,500: Today "₹3,500 due"; card "Still due ₹3,500" (box ₹3,500); patient page "Collect ₹2,950"; WhatsApp "*Total due: ₹2,950*".

**Fix**
- **Database:** migration step 1. `payments.visit_id` becomes `not null … on delete restrict`, the policy is simplified, and the loose rows are removed after the owner's OK.
- **Action:** `deleteVisit` first reads the visit's payments. If there are any, it stops before touching anything, with: "This visit holds ₹1,500 in payments (cash ₹1,000, UPI ₹500). If they were a mistake, remove them in Payment first, then delete the visit."
- **Screen:** the delete question becomes "Delete this visit, with its notes, photos and bill?"
- **Data:** remove the loose-payment query and the "advance" special case (`patient-hub.ts:61`, `:99-100`).

**Files:** new `supabase/logic-fixes-2026-10.sql`; `supabase/schema.sql`; `src/lib/actions/visits.ts`; `src/components/clinic/VisitFlow.tsx`; `src/lib/data/patient-hub.ts`; `src/lib/data/types.ts` (`Payment.visit_id: string`).

#### 2. Money is added up four different ways
**Breaks:** 12, 13, 14, 15.

**On the phone** (a and b need two different days, because Start visit reopens the same day's visit):
- **a. The worked example** from PRODUCT.md: the box asks for ₹3,000 too much.
  1. Day 1: Consultation ₹200. Type 3200 in the box → Cash received. The card says "Advance with us ₹3,000".
  2. Day 2: add Crown ₹7,499. The four screens disagree:
     - Card: "Still due ₹7,499", box pre-filled ₹7,499. The ₹3,000 is never mentioned.
     - Today: "₹7,499 due".
     - Patient page: "Collect ₹4,499".
     - WhatsApp: "*Total due: ₹4,499*".

   If the doctor takes what the card asks for, the patient pays ₹3,000 too much.
- **b. Both buttons at once.**
  1. Day 1: Scaling ₹1,000, paid ₹2,000.
  2. Day 2: Filling ₹500, not paid.

  The patient page shows a red "Collect ₹500" and a green "Advance with us: ₹500" together. The patient owes nothing; they have ₹500 with the clinic.
- **c. "Collect" when nothing is owed.**
  1. Day 1: Extraction ₹800, paid ₹500.
  2. Day 2: Consultation ₹500. Type 800 in the box to clear the old ₹300.

  The patient page still says "Collect ₹300", and Today's Needs you lists "₹300 due, Collect". The old visit's WhatsApp says "Nothing due".
- **d.** Charge ₹600, pay ₹600, then remove the charge. Today says "No bill" for a visit that holds ₹600, while the card says "Advance with us ₹600".

**Evidence:** each screen has its own sum.
- `data/dues.ts:32` (linked payments only) and `:46` (positive visits only); `app/app/page.tsx:46-47` hides a due whose visit is listed.
- `data/visits.ts:47-63` with `lib/visit-status.ts:6-10`: one visit at a time, and a total of 0 means "No bill".
- `data/patient-hub.ts:99-112`. When the patient's balance is not positive, `due.amount` is that visit's own balance, so Collect and Advance can both show (`patients/[id]/page.tsx:60-70`).
- `data/billing.ts:44-47` works out "earlier" correctly, but `PaymentCard.tsx:31-32` pre-fills this visit's balance, `:99` shows other visits only when positive, and `:107` hides the box when this visit is paid.
- `lib/billing.ts:79-93`: the message puts two different amounts in bold.
- PGlite M2, M3 and M4 print the exact amounts above (appendix).

**Fix (one rule, used by every screen)**

Add to `src/lib/billing.ts`, with unit tests. It is checked in `account-rule2.mjs` against every case above, and the parts always add up to the total:
```ts
// A payment pays its own visit first; anything extra pays the oldest visit still unpaid;
// what is left over is an advance. Worked in paise, so the parts always add up.
export function patientAccount(visits: { id: string; date: string; createdAt: string; charged: number; paid: number }[]) {
  const paise = (n: number) => Math.round(n * 100)
  const oldestFirst = [...visits].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  let extra = 0, charged = 0, paid = 0
  const due = new Map<string, number>()
  for (const v of oldestFirst) {
    const c = paise(v.charged), p = paise(v.paid)
    charged += c; paid += p
    due.set(v.id, Math.max(c - p, 0))
    extra += Math.max(p - c, 0)
  }
  for (const v of oldestFirst) {
    const use = Math.min(due.get(v.id)!, extra)
    due.set(v.id, due.get(v.id)! - use)
    extra -= use
  }
  return { owed: (charged - paid) / 100, dueByVisit: new Map([...due].map(([id, d]) => [id, d / 100])) } // owed < 0: advance
}
```

How each screen uses it:
- **Today** (`data/dues.ts`, `data/visits.ts`, `app/app/page.tsx`):
  - Needs you lists every patient with `owed > 0` and links to their newest visit that still has a part owed.
  - A visit row's badge shows that visit's part.
  - A due is left out of Needs you only when today's row already shows the whole amount.
- **Patient page** (`data/patient-hub.ts`, `patients/[id]/page.tsx`): "Collect ₹owed" when `owed > 0`, "Advance with us" when `owed < 0`, never both. Visit badges come from `dueByVisit`.
- **Visit page** (`data/billing.ts`, `PaymentCard.tsx`):
  - This visit's lines and payments, then one line for other visits, whichever way it goes: "₹300 due from other visits" or "₹3,000 advance from other visits".
  - The bottom line and the box use `owed`. The box shows whenever `owed > 0`.
- **WhatsApp** (`visitMessage`): this visit's lines and payments, then one bold line with the amount to pay (`owed`) or the advance.
- **Badges** (`lib/visit-status.ts`): "₹X due" (this visit's part), "Paid", "Paid ahead" (money paid, nothing charged), or "No bill".
- **Optional:** read the per-visit sums from the `visit_money` view (migration step 6) instead of fetching every charge and payment (`dues.ts:26-40`).

### Should fix

#### 3. Send marks a later booking today as "done", and its time is offered again
**Breaks:** 20, 22.

**On the phone**
1. Book Meena for 10:30 AM, and again for 6:30 PM today (Book appointment twice; "come back for the dressing").
2. At 10:30, tap Start on her row, type a note, and Send on WhatsApp. The message says "Next appointment: today 6:30 PM".
3. The app has marked the 6:30 PM booking "done". 6:30 PM shows as free on Today, and the website offers it.

**Evidence**
- `actions/visits.ts:186-198` marks every booked appointment the patient has today as done, except one booked from this visit. It does this after reading the next appointment at `:156-161`.
- PGlite `logic-calendar.test.mjs` C1: both bookings become `done`, `get_open_slots` offers 18:30, and a stranger's website request for 6:30 PM is saved.

**Fix:** only mark appointments that have already started. Replace `.lte('starts_at', end)` and the `.or(...)` with `.lte('starts_at', new Date().toISOString())`.

**File:** `src/lib/actions/visits.ts`.

#### 4. Today hides all of a patient's appointments once one visit is listed
**Breaks:** 21.

**On the phone:** as in finding 3, but before Send. Today lists only "Meena" (the visit). Her 6:30 PM appointment is still booked but shows nowhere on Today; booked times are not in the Free times pills either.

**Evidence:** `app/app/page.tsx:50-54` hides every appointment of a patient who has a listed visit. `data/appointments.ts:45` does not even read `visit_id`. C1 prints what Today lists: only the visit.

**Fix:** read `visit_id` with each appointment. Hide an appointment only when its own `visit_id` belongs to a listed visit.

**Files:** `src/lib/data/appointments.ts`, `src/app/app/page.tsx`.

#### 5. "WhatsApp sent" stays after the bill changes
**Breaks:** 8.

**On the phone**
1. Filling ₹1,200 → UPI → Payment received → Send on WhatsApp. The message says "*Paid in full.* Thank you!"
2. The money never arrives, so remove the payment.
3. Today shows "₹1,200 due" next to "WhatsApp sent". Nothing says the patient's message is out of date. Sending again is not recorded either.

**Evidence**
- `actions/visits.ts:183` records only the first send (`is('closed_at', null)`).
- `lib/visit-status.ts:9`: sent means `closed_at` is set.
- Adding or removing a charge or payment (`actions/billing.ts`) never touches the visit.
- PGlite M6 prints exactly this, and shows that the second send is not recorded.

**Fix**
- **Database:** migration step 2. A `resend_needed` flag that the database itself sets whenever a sent visit's charges or payments change.
- **Action:** `markWhatsappSent` clears the flag on every send.
- **Screens:** the badge says "Bill changed – send again" (amber) instead of "WhatsApp sent". On the visit page, Send becomes the main button again, above it the line "The bill changed after the WhatsApp was sent."

**Files:** migration; `actions/visits.ts`; `lib/visit-status.ts`; `VisitStatusBadge.tsx`; `SendWhatsApp.tsx`; `data/visits.ts`; `data/patient-hub.ts`; `data/types.ts`.

#### 6. Changing the next visit after sending tells the patient nothing
**Breaks:** 8, 22.

**On the phone**
1. On a visit, Next visit → Book the suggested time → Send on WhatsApp. The message has that time.
2. Next visit → Change → pick another time. No WhatsApp opens, so the patient still has the old time.

From the patient page, Move opens the "has been moved to" message.

**Evidence:** `bookNextVisit` (`actions/visits.ts:93-126`) returns no message, and `NextVisit.tsx:52-68` has nothing to open. Compare `moveAppointment` (`actions/appointments.ts:179-184`).

**Fix:** when the visit was already sent, `bookNextVisit` returns a WhatsApp link: the moved message if it moved the booking, the confirmation if it made a new one. `NextVisit` then shows "Open WhatsApp", as Move does.

**Files:** `src/lib/actions/visits.ts`, `src/components/clinic/NextVisit.tsx`.

#### 7. Photo files can outlive Delete
**Breaks:** 16, 17.

**On the phone:** hard to see. It needs the storage call to fail just after the row is deleted, for example on a weak signal. The photo then vanishes from the app, but the file stays in storage, and any 30-day link already sent keeps working.

**Evidence**
- `actions/visits.ts:78-80` deletes the row, then calls `remove()` and ignores the result.
- `:211-215` does the same for a whole visit.
- The test clean-up already has to sweep files left without a row (`e2e/helpers.ts:70-75`).

**Fix:** delete the file first, then the row.
- **A photo:** read its path, call `remove()`, and stop with "Could not delete the photo" if that fails. Only then delete the row.
- **A visit:** first the payment check (finding 1). Then list the folder `<doctor>/<visit>/` as well as the rows (this also catches finding 21), remove the files, and only then delete the visit.

A retry is safe, because removing a missing file succeeds.

**File:** `src/lib/actions/visits.ts`.

#### 8. Duplicate patients
**Breaks:** 1, 2.

The app has no merge and no Delete patient, so a duplicate is permanent. Each copy holds part of the visits, money and medical alerts.

**On the phone**
- **a.** "Prakash Shetty" (98450 21763, allergic to penicillin) books on the website as "Prakash". Tapping Confirm on Today creates a second patient, "Prakash", with no allergy and no history.
- **b.** On the same request, Other time pre-selects "New patient: Prakash", even when the name matches exactly.
- **c.** Book from a free time → New patient → type an existing number. It is saved as a new patient with no warning. The New patient form does warn.
- **d.** New patient → Start visit on a weak signal → "This screen didn't load" → Try again, with the form still filled in. A second identical patient is made.

**Evidence**
- a: `actions/appointments.ts:248-251` links only when exactly one patient has the same phone and the same name; otherwise it creates a new one. PGlite C8: two records with that phone, the new one without the allergy.
- b: `SlotScheduler.tsx:39`, where the default is `null` ("New patient").
- c: `actions/appointments.ts:136-140` and `BookAppointment.tsx:128-143`.
- d: `actions/patients.ts:63-70` makes the id on the server. Visits, charges and payments have ids made on the phone.

**Fix**
- **a.** When the phone is already known and there is not exactly one same-name match, one-tap Confirm does not create a patient. It opens the request page saying "This number belongs to Prakash Shetty" (`confirmRequestAsAsked` returns `needsChoice`; `RequestCard` routes).
- **b.** The request page pre-selects the match when one patient has the same name, or when only one patient has that number.
- **c.** `bookNewPatient` looks the number up first and shows any matches, with "Book <name>" or "Someone new" (for family).
- **d.** `PatientForm` sends an id made on the phone. `createPatient` inserts with it and treats 23505 as already saved, as visits do.

**Files:** `actions/appointments.ts`, `RequestCard.tsx`, `SlotScheduler.tsx`, `BookAppointment.tsx`, `actions/patients.ts`, `PatientForm.tsx`.

#### 9. Linking a request to a known patient drops their new medical alert
**Breaks:** 2.

**On the phone**
1. Prakash Shetty (alert: "Diabetic") books on the website with the same name and phone, and writes "Now on blood thinners" under medical alerts.
2. On Today, Confirm links him to his record.
3. His record still says only "Diabetic". The request page now shows just "booked already", so what he wrote is never seen again.

**Evidence:** the existing-patient branch at `schema.sql:700-705` only checks that the patient exists. A handled request shows no details (`requests/[id]/page.tsx:23-38`). PGlite C11: the record still says "Diabetic".

**Fix:** migration step 5. The request's alert is added to the record as "Now on blood thinners (website, 14 Oct 2026)", unless the record already contains it. PGlite fix 5 shows it working.

**Files:** migration, `supabase/schema.sql`.

#### 10. Confirm or Decline retried after a lost reply loses the patient's message
**Breaks:** 26, 30.

**On the phone**
1. Tap Confirm on a weak signal. The booking is saved, but the reply never arrives (an error, or "This screen didn't load").
2. Tap again, or Try again. Either "This request has already been handled." appears with no WhatsApp button, or the card has simply gone.

The patient page has only Move and Cancel, so the confirmation can never be sent from the app.

**Evidence**
- `schema.sql:684-686` raises the error.
- `actions/appointments.ts:54` and `:78` pass it on as an error.
- `RequestCard.tsx:31-35` and `SlotScheduler.tsx:53-56` then show no link.
- `patients/[id]/page.tsx:92-98` has no other way to send it.
- PGlite C4 shows the retry: "This request has already been handled."

**Fix:** make both actions safe to repeat. On "already handled", read the request:
- if it is booked, return the confirmation link for its appointment's actual time, as a success;
- if it is declined, return the decline link.

Optionally, add "Send confirmation again" on the page of a booked request.

**Files:** `src/lib/actions/appointments.ts`, `src/app/app/requests/[id]/page.tsx`.

#### 11. "Close this day" when patients are already booked
**Breaks:** 27.

**On the phone:** with Prakash booked on Thursday at 10:30, go to Today → Thursday in the strip → Close this day. Nothing warns you. Prakash stays booked, the website hides the day, and he will come to a closed clinic.

**Evidence:** `blockTime` (`actions/appointments.ts:197-214`) inserts the time off without looking, and `CalendarActions.tsx:47` asks nothing. PGlite C5: closing Thursday is allowed, Prakash stays booked, and the website offers nothing that day.

**Fix:** `blockTime` refuses when booked appointments overlap, and names them: "Prakash Shetty (10:30 AM) is booked on this day. Move or cancel first, then close the day." If website requests are waiting for that day, the message says to decline them on Today.

**Files:** `src/lib/actions/appointments.ts`, `src/components/clinic/CalendarActions.tsx` (shows the message).

#### 12. Reopening one time inside a closed day reopens the whole day
**Breaks:** 28.

**On the phone**
1. Close a day.
2. On that day, tap an "Off" time (to fit in one emergency). The screen says "This time is blocked off (Closed)" → tap Reopen.
3. The whole day is now open on the website.

**Evidence:** `unblockTime` (`actions/appointments.ts:217-230`) deletes every time off that covers the moment, including the whole-day block. `book/page.tsx:46-50` offers Reopen on any blocked time. PGlite C5: after reopening 4:30 PM, 11 times are offered on the closed day.

**Fix:** `unblockTime` removes only time off that lies inside that one block. When the time is inside a longer block (a closed day), the notice says "This whole day is closed" and the button says "Reopen the day".

**Files:** `actions/appointments.ts`, `book/page.tsx`, `CalendarActions.tsx`.

### Nice to have

**13. Deleting a sent visit leaves a "done" appointment with no visit** (breaks 20).
- **On the phone:** Start from a booked row, Send, then Delete visit. The appointment stays "done", so the patient disappears from that day's list.
- **Also:** the delete question does not say that a next visit booked from this visit stays booked, or that this bill already went to the patient.
- **Evidence:** `schema.sql:227-228` (`set null`); PGlite C2.
- **Fix:**
  - `deleteVisit` puts a linked "done" appointment back to "booked". It leaves it alone if that time has since been taken (23P01).
  - The question names what stays: "The next visit on Sat 17 Oct, 10:30 AM stays booked. This bill was sent on WhatsApp."
- **Files:** `actions/visits.ts`, `VisitFlow.tsx`.

**14. Two visits for one patient on one day** (breaks 4).
- **On the phone:** Start visit in Chrome and in the home-screen app at the same moment.
- **Evidence:** no unique rule (`schema.sql:121-130`); `data/visits.ts:144-171` reads, then inserts; PGlite C3.
- **Fix:** migration step 3. In `findOrCreateTodaysVisit`, a 23505 from the new index means "read today's visit and return it".
- **Files:** migration, `data/visits.ts`.

**15. Confirm accepts a time that is already over** (breaks 26).
- **On the phone:** Today was opened at 10:00 with a request for 10:30. Tap Confirm at 11:00. It is booked for 10:30 today, and the patient is told "confirmed".
- **Evidence:** `schema.sql:691-693` compares against the start of today. `data/appointments.ts:178` decided Confirm when the page loaded. PGlite C4.
- **Fix:** migration step 5. A block that is already over is refused; the block in progress may still be confirmed. PGlite fix 5.

**16. A screen left open can book into blocked time or the past** (breaks 19).
- **Evidence:** `bookAppointment` (`actions/appointments.ts:102-112`), `moveAppointment` (`:169-175`) and `bookNextVisit` (`actions/visits.ts:96-120`) do not check time off. They check the past only by date (next visit) or not at all. The screens hide such times, but a page left open does not refresh. PGlite C5 and C6.
- **Fix:** migration step 4, one database rule for every path. PGlite fix 4 also shows that Send and Cancel still work on past appointments.
- **Also:** `bookNextVisit` must show database messages (P0001); today it maps only 23P01 (`actions/visits.ts:122`).

**17. Waiting requests** (breaks 24).
- **What happens:** a request is held on the website for only 24 hours. After that, a second visitor can request the same time. Meanwhile Today keeps listing every waiting request forever, even when its time has passed.
- **Evidence:** `schema.sql:506-511`; `data/appointments.ts:166-180`; PGlite C7 (two waiting requests for one block; the first can no longer be confirmed).
- **Fix (simplest):** the card says "Time passed" or "No longer held (asked 2 days ago)" and offers Decline right there.
- **Files:** `data/appointments.ts`, `RequestCard.tsx`.

**18. Notes saved to a deleted visit say "Saved"** (breaks 31).
- **On the phone:** delete a visit in one tab while it is still open in another, then type there.
- **Evidence:** `actions/visits.ts:43` never checks that a row changed. The comment at `VisitNotes.tsx:97-101` expects a refusal. PGlite C10: 0 rows changed, no error.
- **Fix:** add `.select('id')` and return an error when no row comes back (the same in `setPhotoKind`).

**19. A ₹0 line reads three ways** (breaks 14).
- **What happens:** the card says "Paid in full", Today says "No bill", and the message has a "*Payment*" heading with nothing under it.
- **Evidence:** `PaymentCard.tsx:95-96`, `visit-status.ts:8`, `lib/billing.ts:73-81`; PGlite M5.
- **Fix:** in the shared rule, nothing charged and nothing paid means "No charge" on the card, "No bill" on the badge, and no Payment section in the message.

**20. Slow Send records "WhatsApp sent" before WhatsApp opens** (breaks 8).
- **What happens:** the server records the send while preparing (`SendWhatsApp.tsx:213`) and the screen shows "WhatsApp sent" (`:222`). When the server is slow (more than 2 seconds), WhatsApp waits for a tap on "Open WhatsApp" (`:228-229`). If the doctor leaves, Today says sent.
- **Fix:** in the slow case, show "Message ready" and record the send when "Open WhatsApp" is tapped.

**21. Photo files uploaded but never recorded** (breaks 16).
- **What happens:** the file uploads, but the row is never recorded. Causes: the tab closed, a removal that failed (`PhotoGallery.tsx:85-87`), or a visit deleted in another tab, which makes `addVisitPhoto` fail on every retry.
- **Fix:** `deleteVisit` empties the visit's folder (finding 7). Run the read-only orphan query in section 4 now and then.

**22. A patient without a phone** (breaks 20).
- **What happens:** Send is impossible (`SendWhatsApp.tsx:305-309`), so the linked appointment stays "booked", and the day strip counts it as booked (`data/appointments.ts:120-136`).
- **Fix:** the day strip counts only appointments without a visit. Anything that reads appointments later (analytics) should treat a linked visit as attended.

**23. Retries that report an error for something that worked** (breaks 30).
- **What happens:**
  - Delete visit after a lost reply says "Could not delete the visit." The visit is already gone (`actions/visits.ts:211-212`).
  - Book after a lost reply says "That time is already booked", about its own booking (`actions/appointments.ts:113`).
- **Fix:**
  - `deleteVisit` takes the patient id from the page and treats "already gone" as success.
  - `bookAppointment`, on 23P01, checks whether the clash is this patient at this time, and if so returns success with the link.

**24. Cancel offers no message** (breaks 22).
- **What happens:** `cancelAppointment` (`actions/appointments.ts:152-160`) returns nothing to send. Move gives a message; Cancel does not.
- **Fix:** after Cancel, offer an optional "Tell <name> on WhatsApp" with a short cancellation message. Add `cancelledMessage` to `lib/whatsapp.ts`.

**25. Deleting a patient outside the app** (breaks 3, 16, 25).
- **What happens:** a patient deleted from the dashboard keeps their photo files in storage, and their booked request is left pointing at nothing (`schema.sql:291-292`; PGlite C9).
- **Fix:** nothing needed now. If Delete patient is ever added: refuse while payments exist (as for visits), remove the photo files first, then the row. The test clean-up already removes the files (`e2e/helpers.ts:50-54`).

---

## 3. Deleting a visit that holds money: refuse, don't cascade

**Recommendation: refuse.**

While a visit has payments, Delete visit is refused. The message names the amounts, for example "This visit holds ₹1,500 in payments (cash ₹1,000, UPI ₹500)", and says to remove them in Payment first if they were a mistake. Removing a payment already asks "Remove this payment (₹X)? Only do this to fix a mistake." The database enforces the same rule (`on delete restrict`), so no path can lose money, now or later.

Why refuse rather than "delete them too, after a question that names the amount":
- **The payments record real money in the cash drawer and the UPI account.** If they vanish with a visit, the books no longer match the bank. That matters for the money analysis the owner wants later.
- **A refusal needs no new screen.** Each payment already has its bin and its own question with the amount. The rule stays one sentence: money is removed one payment at a time, on purpose.
- **A question is easy to tap through on a busy day; a refusal is not.** Deleting a visit is rare (a wrong patient, or a test), so two extra taps cost almost nothing.
- **The database guarantees it.** That covers every path: the dashboard, future code, scripts.

PGlite (`fk-order.mjs`, `fk-order-inline.mjs`) shows that `restrict` refuses the visit delete but still lets the following delete cleanly:
- a patient, cascading (the e2e clean-up deletes patients);
- everything, through `reset-all-data.sql` (TRUNCATE … CASCADE).

The result is the same whether the rule is added by migration or written into a fresh `schema.sql`.

Charges and photos still go with the visit. Charges are its bill, not money received. Photo files are removed by the action (finding 7).

---

## 4. Database changes needed

**One migration, `supabase/logic-fixes-2026-10.sql`.**
- It is tested in PGlite on top of `schema.sql`, with a deleted visit's loose payment already in the data. All six checks in `logic-fixes.test.mjs` pass.
- It is safe to run twice.
- `supabase/tests/booking.check.mjs` still passes 104/104 with it.
- After applying it live, fold the same changes into `supabase/schema.sql`, so a fresh project matches.
- Run it after clinic hours, as usual.

```sql
-- Logic audit fixes (docs/build/review-logic.md). One transaction; safe to run again.
--
-- BEFORE running it on the live project, run these read-only checks and show the owner the result:
--   select id, patient_id, amount, method, received_at from public.payments where visit_id is null;      -- removed by step 1
--   select patient_id, visit_date, count(*) from public.visits group by 1, 2 having count(*) > 1;        -- must be empty for step 3
--   select id, patient_id, starts_at from public.appointments where status = 'done' and visit_id is null; -- history, left as is
--   select o.name from storage.objects o where o.bucket_id = 'visit-photos'
--     and not exists (select 1 from public.visit_photos p where p.storage_path = o.name);               -- delete in the dashboard (Storage)

begin;

-- 1. Every payment belongs to a visit, and a visit that holds money cannot be deleted (findings 1, 2).
--    The rows deleted here are payments of visits deleted before this fix: the "Advance with us" the
--    owner saw. Owner's OK first (see the check above).
delete from public.payments where visit_id is null;
alter table public.payments alter column visit_id set not null;
alter table public.payments drop constraint if exists payments_visit_id_fkey;
alter table public.payments add constraint payments_visit_id_fkey
  foreign key (visit_id) references public.visits (id) on delete restrict;

drop policy if exists "Owner full access" on public.payments;
create policy "Owner full access" on public.payments
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.visits v
                where v.id = payments.visit_id and v.owner_id = (select auth.uid())
                  and v.patient_id = payments.patient_id)
  );

-- 2. "WhatsApp sent" means the patient has the current bill (finding 5). Any change to a sent visit's
--    charges or payments sets resend_needed; markWhatsappSent clears it.
alter table public.visits add column if not exists resend_needed boolean not null default false;

create or replace function public.mark_bill_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.visits v
  set resend_needed = true
  where v.id in (old.visit_id, new.visit_id)   -- old is null on insert, new is null on delete
    and v.closed_at is not null
    and not v.resend_needed;
  return null;
end;
$$;

create or replace trigger visit_charges_bill_changed
  after insert or update or delete on public.visit_charges
  for each row execute function public.mark_bill_changed();
create or replace trigger payments_bill_changed
  after insert or update or delete on public.payments
  for each row execute function public.mark_bill_changed();

-- 3. One visit per patient per day: "Start visit" always reuses today's visit (finding 14).
create unique index if not exists visits_one_per_patient_day on public.visits (patient_id, visit_date);

-- 4. A booked appointment is never in blocked time or already over, whichever screen or action made or
--    moved it (finding 16). Status changes (done, cancelled) are not checked, so Send and Cancel
--    still work on past appointments.
create or replace function public.check_appointment_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'booked' and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at
                                or new.duration_min is distinct from old.duration_min) then
    if public.appointment_end(new.starts_at, new.duration_min) <= public.clinic_now() then
      raise exception 'That time has already passed.';
    end if;
    if exists (select 1 from public.time_off t
               where t.owner_id = new.owner_id
                 and tstzrange(t.starts_at, t.ends_at)
                     && tstzrange(new.starts_at, public.appointment_end(new.starts_at, new.duration_min))) then
      raise exception 'That time is blocked off in your calendar.';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger appointments_check_time
  before insert or update on public.appointments
  for each row execute function public.check_appointment_time();

-- 5. Confirming a website request (findings 9, 15): a block that is already over is refused (the
--    block in progress may still be confirmed), and when the request is linked to a patient already in
--    the app, what the patient wrote under medical alerts is added to their record, never dropped.
create or replace function public.confirm_booking_request(
  p_request uuid,
  p_starts_at timestamptz,
  p_patient uuid default null
)
returns table (patient_id uuid, appointment_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.booking_requests;
  v_patient uuid;
  v_appointment uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Please sign in.';
  end if;

  select * into r from public.booking_requests b
  where b.id = p_request and b.owner_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'That request was not found.';
  end if;
  if r.status not in ('new', 'contacted') then
    raise exception 'This request has already been handled.';
  end if;

  if not public.is_clinic_slot(p_starts_at) then
    raise exception 'Please choose one of the clinic time blocks (the clinic is closed on Fridays).';
  end if;
  if public.appointment_end(p_starts_at, 40) <= public.clinic_now() then
    raise exception 'That time has already passed.';
  end if;
  if exists (select 1 from public.time_off t
             where t.owner_id = (select auth.uid())
               and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, public.appointment_end(p_starts_at, 40))) then
    raise exception 'That time is blocked off in your calendar.';
  end if;

  if p_patient is not null then
    select p.id into v_patient from public.patients p
    where p.id = p_patient and p.owner_id = (select auth.uid());
    if v_patient is null then
      raise exception 'That patient was not found.';
    end if;
    if nullif(btrim(r.medical_alerts), '') is not null then
      update public.patients p
      set medical_alerts = case
        when nullif(btrim(p.medical_alerts), '') is null then r.medical_alerts
        when position(lower(btrim(r.medical_alerts)) in lower(p.medical_alerts)) > 0 then p.medical_alerts
        else p.medical_alerts || E'\n' || r.medical_alerts
             || ' (website, ' || to_char(r.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') || ')'
      end
      where p.id = v_patient;
    end if;
  else
    insert into public.patients (name, phone, gender, birth_year, address, medical_alerts, heard_from)
    values (r.name, r.phone, r.gender, r.birth_year, r.address, r.medical_alerts, r.heard_from)
    returning id into v_patient;
  end if;

  begin
    insert into public.appointments (patient_id, starts_at, duration_min, reason, status)
    values (
      v_patient, p_starts_at, 40,
      coalesce(nullif(concat_ws(' - ', r.reason, r.notes), ''), ''),
      'booked'
    )
    returning id into v_appointment;
  exception when exclusion_violation then
    raise exception 'That time was just taken. Please choose another block.';
  end;

  update public.booking_requests b
  set status = 'booked', patient_id = v_patient, appointment_id = v_appointment
  where b.id = r.id;

  return query select v_patient, v_appointment;
end;
$$;

revoke all on function public.confirm_booking_request(uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking_request(uuid, timestamptz, uuid) to authenticated;
revoke all on function public.mark_bill_changed() from public, anon, authenticated;
revoke all on function public.check_appointment_time() from public, anon, authenticated;

-- 6. (Optional, for finding 2) Money per visit in one place: every screen reads charged and paid from
--    here and applies one rule in src/lib/billing.ts. security_invoker: row-level security applies as usual.
create or replace view public.visit_money with (security_invoker = true) as
  select v.id as visit_id, v.patient_id, v.visit_date, v.created_at, v.closed_at, v.resend_needed,
    coalesce((select sum(c.amount) from public.visit_charges c where c.visit_id = v.id), 0)::numeric(12,2) as charged,
    coalesce((select sum(p.amount) from public.payments p where p.visit_id = v.id), 0)::numeric(12,2) as paid
  from public.visits v;
revoke all on public.visit_money from anon;
grant select on public.visit_money to authenticated;

commit;

notify pgrst, 'reload schema';
```

**What to backfill on the live data.** It is trial data until go-live, when `reset-all-data.sql` erases it, so the stakes are low. Still, show each item to the owner first.
1. **Loose payments** (step 1 deletes them): the "Advance with us" the owner saw. List them with the first check, then delete.
2. **Duplicate visits on one day** must be gone before step 3. If any exist, the owner picks which to keep; copy notes across by hand.
3. **"Done" appointments without a visit:** leave them; they are history.
4. **Orphan photo files:** list them with the last check and delete them in the dashboard (Storage). Supabase's storage guard blocks SQL deletes, as the build log notes.
5. **Patients sharing a phone:** report only, since families are allowed and there is no merge tool:
   `select phone, array_agg(name) from public.patients where phone is not null group by phone having count(*) > 1;`
6. **Medical alerts from requests already linked to existing patients:** report, and copy by hand if needed:
   `select p.name, b.medical_alerts from public.booking_requests b join public.patients p on p.id = b.patient_id where nullif(btrim(b.medical_alerts), '') is not null and position(lower(btrim(b.medical_alerts)) in lower(coalesce(p.medical_alerts, ''))) = 0;`
7. `resend_needed` starts as false for every visit. Nothing to fill in.

**Code that must change with the migration**
- `src/lib/data/types.ts`: `Payment.visit_id: string`; `Visit.resend_needed`.
- `bookNextVisit` must show database messages (P0001) as `bookAppointment` already does (`actions/appointments.ts:26-31`).
- `e2e/today.spec.ts:29` books today at 19:00. After 7:40 PM, step 4 refuses it ("That time has already passed."), so the fixture must skip once that time is over.
- `findOrCreateTodaysVisit` handles the new unique index (finding 14).

---

## 5. Tests that would have caught each finding

None of these paths is tested today. No test deletes a visit, records an advance, closes a day, reopens a block, or retries Confirm. Once the fixes are in, the PGlite proofs listed in the appendix could become `supabase/tests/logic.check.mjs`, run next to `booking.check.mjs`.

| # | Test | Kind |
|---|---|---|
| 1 | Deleting a visit that has a payment is refused, and `payments.visit_id` is never null. e2e (`visit.spec.ts`): pay ₹200, then Delete visit → "remove the ₹200 payment first". Remove it and delete again → no "Advance" on the patient page. | PGlite + e2e |
| 2 | `patientAccount` in `billing.test.ts`, with the cases from `account-rule2.mjs`: the worked example (₹4,499), overpaid then unpaid (₹500 advance, nothing to collect), an old due paid on a new visit (nothing owed), a part payment that stays on its own visit, decimals. e2e: a fixture advance on day 1 and a crown on day 2 → Today, the patient page, the card, the box and the message all show ₹4,499. | unit + e2e |
| 3 | Two bookings today: a 10:30 linked to the visit, and 6:30 PM. After Send, the 6:30 PM booking is still booked, and `/book` does not offer 6:30 PM. | e2e (`visit.spec.ts`) |
| 4 | A listed visit plus a later booking today → Today shows both rows. | e2e (`today.spec.ts`) |
| 5 | Removing a payment after the send sets `resend_needed`. e2e: the badge then reads "Bill changed – send again". | PGlite + e2e |
| 6 | Send, then Change the next visit → a WhatsApp link with "has been moved to". | e2e (`visit.spec.ts`) |
| 7 | A file-first delete helper, with a fake storage client that fails → the row is kept and an error returned. e2e: delete a photo, or a visit with photos → its storage folder is empty. | unit + e2e |
| 8 | An existing patient and a request with another spelling → one-tap Confirm makes no second record. The request page pre-selects the match. Phone booking with a known number shows the match. | e2e (`times.spec.ts`) |
| 9 | Confirm with an existing patient adds the request's alert to the record. | PGlite (fix 5) |
| 10 | Confirm a request, then tap Confirm again on the old card (a second tab) → the WhatsApp confirmation still opens. | e2e |
| 11 | A booked patient on a day → Close this day is refused, with their name, and no time off is saved. | e2e (`today.spec.ts`) |
| 12 | Close a day, then reopen one block → the website still offers nothing that day. | PGlite + e2e |
| 13 | Delete a sent visit → its appointment is booked again on Today. | e2e |
| 14 | A second visit on the same day is refused. | PGlite (fix 3) |
| 15 | Confirm at 3 PM for 10:30 the same day is refused. | PGlite (fix 5) |
| 16 | Booking or moving into time off, or into the past, is refused; done and cancelled still work on past rows. | PGlite (fix 4) |
| 17 | The request card for a request asked more than 24 h ago, or whose time has passed. | unit |
| 18 | Notes on a deleted visit → "Couldn't save the note". | e2e |
| 19 | A ₹0 bill → no Payment heading in the message. | unit (`billing.test.ts`) |
| 20 | A slow server (stubbed) → "Message ready" until the tap; the visit is not sent. | e2e |
| 21 | Deleting a visit empties its folder, including a file without a row. | e2e |
| 22 | The day strip counts only appointments without a visit. | unit or e2e |
| 23 | "Already gone" is treated as success in `deleteVisit`; a clash with the patient's own booking is treated as success in `bookAppointment`. | unit |
| 24 | Cancel offers a WhatsApp message. | e2e (`times.spec.ts`) |
| 25 | (Only if Delete patient is added) | — |

---

## 6. Checked and fine

- **What the database already refuses** (PGlite "fine" test):
  - a negative charge, a ₹0 payment, an amount too large for the column;
  - a payment or charge on another patient's visit (row-level security);
  - double booking, and moving onto a booked time (exclusion rule).

  A cancelled time can be booked again. The app also checks whole paise and at most ₹10 lakh a line (`actions/billing.ts:16-21`).
- **Double taps:**
  - Start visit uses one id per start (`StartVisitButton.tsx`).
  - Charges and payments use ids made on the phone; 23505 means already saved (`actions/billing.ts:32`).
  - Confirm locks the request row and checks its status.
  - Book is protected by the exclusion rule.
  - Send can be repeated safely.
- **India time:**
  - `todayInIndia`, `inIndia`, `blockInstant` and `indiaDayBounds` are used throughout. Supabase-js URL-encodes the `+05:30`.
  - The visit date defaults to the India date, and SQL uses `clinic_now()` in India time.
  - A Today page left open overnight never links yesterday's booking (`data/visits.ts:196-209`).
  - The clinic closes at 7:30 PM, so midnight edges are rare and are handled.
- **Fridays:** no blocks. The website, Confirm and the next visit all refuse Fridays, and the suggestion skips them.
- **Website booking:** the database re-checks every rule. A visitor's retry after a lost reply gets "You already have a request waiting"; the request was saved and shows on Today.
- **Next visit:** nothing is booked until a time is tapped. Change moves the same booking without doubling it. A next visit that is cancelled can be booked again.
- **Empty visits** are listed nowhere. They keep their linked appointment, and Start reopens them.
- **Notes:** the newest draft on the phone wins, and an old copy of the page never overwrites newer notes. (A deleted visit is finding 18.)
- **Send:** it waits for pending saves and uploads, then reads the bill and the next appointment fresh. Photo links are made only for ticked photos of this visit.
- **Removing a charge or a payment** always asks first, naming the item or the amount.
- **Delete patient:** the app has none. `bookNewPatient` deletes only a patient it has just created, when the booking fails, and nothing else points at that patient. The test clean-up removes photo files itself.
- **Patient edit:** the age does not drift on save (`age_was`).
- **Share links** are unused, and are deleted with their visit. **app_config** is read-only from the app.
- **An appointment that passed with no visit** stays "booked" as history. Nothing reads it: Coming up, the next-visit suggestion and the website all look only ahead.
- **Two open tabs** with stale amounts could each record a payment. Each tap is deliberate and shows its amount; there is no simple fix, so this is listed here rather than as a finding.
- **The proposed migration:** `reset-all-data.sql` (TRUNCATE … CASCADE), deleting a patient (with or without sent visits, charges, payments, photos and appointments), and the 104 existing booking checks all still work.

---

## Appendix: the proofs

All the scripts are in the session scratchpad, `…/scratchpad/pgtest/`. Run them from the repo with:
`npx vitest run --config <scratchpad>/pgtest/vitest.logic.config.mjs --silent=false --reporter=verbose`
The config points `@` at `src`, so the real `summarise`, `visitStatus` and `visitMessage` are used.

| File | What it proves |
|---|---|
| `logic-base.mjs` | Builds the throwaway database from `schema.sql`, with auth and storage stubbed as in `booking.check.mjs` |
| `screens.mjs` | What Today (`dues.ts` and `getVisitsOn`), the patient page (`patient-hub.ts`), the visit page (`data/billing.ts` and `PaymentCard`) and WhatsApp show, mirrored line by line |
| `logic-money.test.mjs` | M1–M6 (findings 1, 2, 5, 19): 6 of 6 proven |
| `logic-calendar.test.mjs` | C1–C11 (findings 3, 4, 8–10, 11–18, 25) plus the "fine" checks: 12 of 12 |
| `logic-fixes.test.mjs` | The migration: no loose payments; delete refused while money is held; patient and visit cascades still clean; `resend_needed`; one visit a day; time-off and past rule; Confirm (past block refused, medical alert kept): 6 of 6 |
| `fk-order.mjs`, `fk-order-inline.mjs` | `set null`, `restrict`, `no action` and `cascade` compared, with migration-added and inline constraints |
| `account-rule2.mjs` | The money rule in finding 2: 7 of 7 cases; the parts always add up to the total |
| `proposed-logic-fixes.sql`, `fakerepo/` | The migration above; `booking.check.mjs` passes 104/104 with it |

Key outputs, word for word:

- **M1** (deleted visit, then RCT ₹3,500):
  - Today: "Prakash Shetty: ₹3,500 due".
  - Patient page: "Collect ₹2,950".
  - Card: "Still due ₹3,500", "amount box pre-filled with ₹3,500".
  - WhatsApp: "*Balance due: ₹3,500*", "Advance from other visits: ₹550", "*Total due: ₹2,950*".
- **M2** (worked example):
  - Today: "Asha Rao: ₹7,499 due".
  - Card: "Still due ₹7,499", "amount box pre-filled with ₹7,499".
  - Patient page: "Collect ₹4,499".
  - WhatsApp: "*Total due: ₹4,499*".
- **M3a** patient page: "Collect ₹500" and "Advance with us: ₹500".
- **M3b**: patient page "Collect ₹300"; Today "Leela Bhat: ₹300 due, Collect"; old visit's WhatsApp "*Nothing due.*".
- **M6**: message "*Paid in full.* Thank you!", then Today "Suma N: ₹1,200 due + WhatsApp sent"; the second send is not recorded.
- **C1**: after Send, "2026-10-14 10:30 done (linked)" and "2026-10-14 18:30 done"; the website offers 18:30; a stranger's request for 18:30 is saved.
- **C5**: closing a day with a booked patient is allowed and they stay "booked"; a phone booking and a move into the closed day are allowed; after reopening one block, 11 times are offered that day.
- **C8**: two patients with 9845021763, "Prakash Shetty" (Allergic to penicillin, 1 visit) and "Prakash" (no alert, the appointment).
- **C11**: the request said "Now on blood thinners (warfarin)"; the record still says "Diabetic".
- **Fix 1**: delete visit with a payment → `violates foreign key constraint "payments_visit_id_fkey"`; after removing the payment → allowed; delete patient with payments → allowed.
