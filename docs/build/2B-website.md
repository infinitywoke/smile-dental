# Brief 2B: a shorter website booking

**Builder:** Sonnet 5.5, effort medium. **Wave 2**, in parallel with 2A. **End-to-end port:** `E2E_PORT=3102`. Read [README.md](README.md) first (shared rules).

**Changes (SIMPLIFY.md):** C19 and the website side of D3. **Decisions:** D3 (age instead of date of birth) and D5 (shorter booking) are yes.

## What a patient should experience on `/book`
1. **Step 1, times:** as now, but the day labels fit (today "TOMORROV" is cut off), and time buttons and chips are at least 48 dp.
2. **Step 2, details, ending in "Send on WhatsApp":** no "Looks good?" review page. Required: **WhatsApp number, name, gender, reason**. Optional: **age** (number keypad; sent as `p_birth_year` = this year − age; the database function already accepts it), address, medical alerts, a note. Show the chosen time at the top with "Change". Tapping Send saves the request (`submitBookingRequest`) and opens the clinic's WhatsApp with the message, as today.
3. Nothing else changes: the database still enforces every booking rule, the confirmation promise text stays, and the how-did-you-hear answer is still pre-filled from the link the visitor came from.

## Files only you edit
`src/components/site/PublicBookingForm.tsx`, `src/app/(public)/book/page.tsx`, `src/lib/actions/booking.ts`, `e2e/website.spec.ts`, and the `SubmitBookingRequestArgs` type in `src/lib/data/types.ts` (add `p_birth_year`; nothing else in that file). `src/components/GenderChoice.tsx` is shared: use it, don't edit it.

## End-to-end test (`e2e/website.spec.ts`)
The page offers real times and no SOS; tapping a time opens the details with the phone field focused; with phone, name, gender and reason filled, "Send on WhatsApp" is enabled and there is no review page; age opens the number keypad. Do not actually send (stop before the tap, or intercept `wa.me` and do not submit).

## Phone check (Chrome, `/book`)
"Tomorrow" fits; time buttons and chips are easy to hit. Tap a time → only phone, name, gender and reason are required; age uses the number keypad. "Send on WhatsApp" is on the details page; WhatsApp opens with the message; the request appears on Today in Clinic OS and its one-tap Confirm works.
