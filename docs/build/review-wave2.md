# Wave 2 review (fresh eyes)

*Reviewed 11 Oct 2026 against `docs/SIMPLIFY.md`, `1C-visit-fixes.md`, `2A-today-patients.md` and `2B-website.md`. Evidence: `git diff 00e7a05 main -- src e2e` (main @ a577858), `tour/out/*.png`, `tour/out/tour.json` (production build, OnePlus 13 size). Gates re-run here: `npx tsc --noEmit` clean, `npm test` 141/141 passing, `npm run lint` clean. E2E 25/25 as reported by the orchestrator (not re-run).*

## Verdict

**Good. No blocker. Six should-fix items, all small.** The app now looks like the plan.
- Today is one list with Start buttons.
- "+" opens New patient.
- Patients searches while you type.
- Age uses the number keypad, and no calendar is left anywhere.
- Practice mode and the top bar are gone.
- The website booking ends on the details page.
- The tour has no Back failures (`tour.json` → `back`: 5/5 correct). Its only Clinic OS control under 48 dp is the photo tick, which is a false alarm because the whole 56 px row is its label.
- The walk-in takes 12 taps over 3 screens (target about 10). A phone booking takes 3 taps.

**1C fixed all 14 Wave 1 findings.** I checked each code path, not just the claims:
- **#1 Send.** Send waits for every pending save (`VisitFlow.tsx:41-55`). `markWhatsappSent` then reads the bill and the next appointment fresh, and the message is built only from that reply. An e2e test taps Send straight after booking (`e2e/visit.spec.ts:150`). The tour's message now has `*Next appointment*`.
- **#2** The booking page skips ahead to the next day that has a free time.
- **#3** If the id from the phone already exists, it is reused only when it is this patient's visit dated today (`data/visits.ts:161-172`). The button makes a fresh id for each start.
- **#4** `useSaveId` keeps the id when the same thing is tapped again and makes a new one after a success. It is safe for two identical fillings added on purpose.
- **#5** Failed photos are retried every 10 s and when the phone comes back online, and Send waits for them.
- **#6/#7** Every notes save sends the on-phone draft. The draft is cleared only while it still matches what was saved, so an old copy of the page finds nothing newer to save. A server refusal stops the retries.
- **#8–#14** All present. The Save bar on the time pickers is solid (`34-request-page.png`).

The new problems are mostly about weak internet and the half-typed New patient form.

## Findings

| # | Severity | What is wrong | Evidence | Fix |
|---|---|---|---|---|
| 1 | Should fix | **A half-typed New patient form comes back for the next walk-in, and there is no way to clear it.** Wave 2 keeps the typing on purpose (C5). But if he starts a patient and abandons them, the next "+" shows that person's phone, address, medical alert and "heard from". He must clear six fields by hand. If he overwrites only the name and gender, **the previous person's medical alert and phone are saved on the new patient**. The returning-patient box also shows the wrong family. | `PatientForm.tsx:21-41` (cleared only after a save); `tour.json` → `back`: "nameKeptOnReturn: Half typed"; the brief asked for "kept until saved or deliberately cleared", but there is no clear control. | Show a small "Clear form" button (48 dp) at the top of the form once anything is typed. Better still, when the form comes back with typing in it, show one line: "Continuing <name>, started 10:42 · Start fresh". |
| 2 | Should fix | **On weak internet a photo can stay on "Uploading…" for good and block Send.** The upload has no time limit. While it is uploading there is no Remove button (only once it has failed). Send says "1 photo still uploading…" and refuses. The only way out is to leave the visit, which loses the photo. | `PhotoGallery.tsx:60-79` (storage upload, no timeout), `:168-172` (no Remove while uploading); `SendWhatsApp.tsx:60-62`, `:85`. | Give each try about 45 s (`AbortController`, or `Promise.race` with a timer), then mark it failed, so the 10 s retry and the Remove button take over. Also show the Remove (X) button while it is uploading. |
| 3 | Should fix | **Patients search on weak internet keeps showing the old list as if it were the results.** A failed search is ignored, so the newest-patients list stays on screen under "20 results for "9717"". He can then tap a patient who does not match and write notes into the wrong person's visit. | `PatientSearch.tsx:29` (`.catch(() => {})`), `:48` (label built from the stale `rows`). | On error, clear the rows and say "Couldn't search. Check the internet." Show "N results" only for results that came back for this query. |
| 4 | Should fix | **On Today, a seen patient's name shrinks to a few letters, and the same amount owed shows three times.** The money badge, "WhatsApp sent" and the time share the name's line, so the name is cut off. In the tour it shows as "TOUR…". A real name like "Prakash Shetty" keeps about 7 letters. The same ₹200 also shows in "Needs you → Collect", in the row's badge and in the row's money line. | `17-today-after-visit.png`; `app/app/page.tsx:160-175` (row), `:117-126` (dues). | Give the name the whole first line. Put the time and badges on the second line, in place of "₹600 billed · ₹400 paid · ₹200 due" (keep only the badges). In "Needs you", skip dues whose visit is already a row on today's list. |
| 5 | Should fix | **Website: Back on step 2 leaves `/book`, and everything typed is lost.** A patient at the details step who uses the Back gesture lands on the previous page. The chosen time and all the typing are gone, and coming back starts again at step 1. Patients use Back more than the on-screen "Back" button. (Known; it matters because this is the step where people give up.) | `PublicBookingForm.tsx:123-130` (`setStep(2)` adds no history entry), `:318`, `:416`. | When going to step 2, add a history entry (`history.pushState`), the way `useBackToClose` does. On `popstate`, go back to step 1 and keep the details. "Change" and "Back" should call `history.back()`. |
| 6 | Should fix | **Website: "Send on WhatsApp" stays grey with no reason, and the required Reason sits below the optional fields.** With a 9-digit phone number or no gender chosen, the button just looks dead. Reason (required) comes after Age and Address (both optional), and the form is still about 2 screens tall. | `04-site-book-2-filled-full.png`; `PublicBookingForm.tsx:120` (`detailsOk`), `:351-375` (order), `:408` (`disabled={… !detailsOk}`). | Order: phone, name, gender, reason, then an "Optional" group (age, address, medical alerts, heard from, note). Keep the button tappable. On a tap with something missing, scroll to the first missing field and name it in one line above the button. |
| 7 | Nice to have | The website's "Please call +91…" link is 18 px tall. It is an inline link in a grey box, with nothing next to it to hit by mistake, so it only costs a second tap. But it is the only way to get a time after 7 PM. The "No online times are free" call link and the login page's "Back to website" (20 px) are similar. | `tour.json` shots[1]: "Please call +91 6361816711 (180x18)"; `PublicBookingForm.tsx:308`, `:237`; shots[4]; `login/page.tsx:59`. | Turn the call link into a 48 dp outlined "Call the clinic" button under the times. Give "Back to website" `min-h-12`. |
| 8 | Nice to have | Send can sit on "Preparing…" for a very long time if a save or the server call hangs. Nothing times out, and the button stays disabled. | `SendWhatsApp.tsx:91-92`; `VisitFlow.tsx:52-55`. | After about 15 s, show "Still trying… Check the internet" with "Try again", and let him tap again. Server actions run one after another, so a second tap is safe. |
| 9 | Nice to have | A photo that never uploaded is still lost if he leaves the visit or Android closes the tab, because the file is kept only in memory. 1C made the warning visible on the page; leaving is still silent. | `PhotoGallery.tsx:39` (`useState` only). | Keep pending files in IndexedDB under the visit id, and resume their upload when the visit opens again. It can wait until after go-live. |
| 10 | Nice to have | Linking an appointment to a visit does not check its date. A patient with two bookings on one day keeps the second as "booked" forever, because only the linked appointment becomes "done" on Send. A Today page left open overnight can also link yesterday's appointment. | `data/visits.ts:195-200` (`linkAppointment`: any appointment of the patient, one per visit); `actions/visits.ts:180`. | In `linkAppointment`, accept only appointments starting today (India time). In `markWhatsappSent`, also mark this patient's other booked appointments today as done. |
| 11 | Nice to have | Website names are saved as typed ("prakash shetty"), while the clinic form capitalises them. The website also checks the age with its own code, which accepts "35.0" and "1e1". | `actions/booking.ts:62`, `:44-48`. | Use `titleCaseName`, `parseAge` and `birthYearFromAge` from `@/lib/patient-fields`. |

Checked with nothing found:
- **Keyboards:** phone on `tel`, age on `numeric`, amounts on `decimal`, search is a text field (names or numbers). Text is 16 px everywhere.
- **Double taps:** Start uses one id per start and finds today's visit first, so a retry after a lost reply opens the same visit. Charges and payments use client ids. Booking, Confirm and Cash are guarded.
- **Money:** amounts are added in paise. "Other visits" and "Due from other visits" are worded correctly. Collect gives "Paid in full" (`19-collect-done.png`).
- **A booked patient already on Today** shows once, as the visit (`page.tsx:48-52`). Start reuses that visit and links the appointment (`data/visits.ts:153-157`).
- **Age on edit** changes `birth_year` only when the age was changed (`age_was`), so saving the form does not age anyone.
- **The booking call** sends `p_birth_year` (and `p_date_of_birth: null`) by name. The database checks the year again (`patch-age.sql:79`).

## For Wave 3 (`3-cleanup.md`)

- **Add:** set `birth_year` from `date_of_birth` on both `patients` and `booking_requests` before dropping `date_of_birth`, or older ages disappear. Then remove:
  - the `date_of_birth` branch of `patientAge`, and `ageOn` with its tests;
  - `date_of_birth` from `PATIENT_COLUMNS` (`data/patients.ts:9`) and from `types.ts:11`, `:156`, `:182`;
  - `p_date_of_birth` in `booking.ts:64`, in the same commit as the new `submit_booking_request` signature (the call uses named arguments).
- **Add:** remove `is_test` from the queries and types: `data/visits.ts:19`, `:32`, `:76`; `data/billing.ts:12`, `:27`; `data/appointments.ts:21`, `:43`, `:46`, `:100`; `types.ts:20`, `:59`, `:168`.
- **Add:** drop the `beforeAction` prop that still sits next to `save`: send the remove buttons and the UPI open through `save` (`BillTools.tsx:41-47`, `:76`; `PaymentCard.tsx:23-29`, `:125`; `VisitFlow.tsx:35`, `:115`, `:123`).
- **Add:** remove the dead `visit-pending:` key in `SignOutButton.tsx:10` (nothing writes it).
- **Add:** Today calls `getDues()` on every day it shows and then discards the result when it is not today (`app/app/page.tsx:38`, `:45`). Skip the call, together with the C27 summed query.
- **Add:** `lookupPhone` relies on `findPatientsByPhone` for the session check. Call `getDoctor()` in the action itself, as the rule says.
- **Keep** `ageOn` only until the backfill is done. The `PHOTO_BUCKET` copy (`PhotoGallery.tsx:12`) is already listed under C25.
- **Drop:** nothing.

## Security

**None found.**
- Every new or changed server action calls `getDoctor()` before touching data. This covers `findPatients`, `startVisit`, `addCharge`, `recordPayment`, `markWhatsappSent` and `appointmentsOfVisit`; `lookupPhone` checks it inside `findPatientsByPhone`.
- Ids made on the phone are checked against the UUID pattern.
- Search text is escaped before the name filter.
- The website still books only through `submit_booking_request` with the public key, and the database checks every rule, including the age.
- No AI package or outside AI call is left in `src/`.
