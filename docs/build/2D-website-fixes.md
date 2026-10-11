# Brief 2D: website booking fixes from the Wave 2 review

**Builder:** Sonnet 5.5, effort medium. Runs in parallel with 2C (Clinic OS). **End-to-end port:** `E2E_PORT=3102`. Read [README.md](README.md) first (shared rules), then [review-wave2.md](review-wave2.md) findings #5, #6, #7 and #11 (evidence and suggested fixes are there).

## What a patient should experience on `/book`
1. **#5, Back works like Android expects:** going from times to details adds a history entry. The Back gesture (or browser Back) on the details step returns to the times **with everything typed kept**; "Change" (the chosen time) and the on-screen "Back" do the same through `history.back()`. Back on the times step leaves the page as usual. Copy the pattern of `useBackToClose` in `src/components/clinic/FullScreen.tsx` (read it, don't import from Clinic OS if it pulls in clinic code; a small local hook is fine).
2. **#6, required first, and Send says what is missing:** order the details as phone, name, gender, reason, then a group headed "Optional" (age, address, medical alerts, how did you hear, note). "Send on WhatsApp" stays tappable: tapped with something missing, it scrolls to the first missing field, focuses it, and names it in one line just above the button ("Please enter your WhatsApp number", "Please choose a reason", ...). Nothing is sent until all four are filled.
3. **#7, the call links are real buttons:** "Please call +91…" (after 7 PM, and the "No online times are free" one) becomes a 48 dp outlined "Call the clinic" button; on `/login`, "Back to website" gets at least 48 dp height.
4. **#11, the same rules as the clinic form:** `src/lib/actions/booking.ts` uses `titleCaseName`, `parseAge` and `birthYearFromAge` from `@/lib/patient-fields` (names get a capital on each word; the age check is the clinic's).

Nothing else changes: the database still enforces every booking rule, the confirmation promise text stays, and the how-did-you-hear pre-fill from the link the visitor came from stays.

## Files only you edit
`src/components/site/PublicBookingForm.tsx`, `src/lib/actions/booking.ts`, `src/app/login/page.tsx`, `e2e/website.spec.ts`. `src/components/GenderChoice.tsx` and `src/lib/patient-fields.ts` are shared: use them, don't edit them.

## Do not touch
Everything builder 2C owns (Clinic OS: `src/components/clinic/**`, `src/app/app/**`, `src/lib/actions/patients.ts`, `visits.ts`, `src/lib/data/**`, `e2e/today.spec.ts`, `visit.spec.ts`, `times.spec.ts`). No database changes, no new packages.

## End-to-end test (`e2e/website.spec.ts`)
Keep the current checks, and add: Back on the details step returns to the times with the typed name still there when you tap a time again; tapping Send with the reason missing names it and does not send; with the four required answers in, Send is ready. Never actually send (stop before the final tap, or intercept `wa.me` and the server action).

## Done when
All gates pass, including `E2E_PORT=3102 npx playwright test e2e/website.spec.ts`.
