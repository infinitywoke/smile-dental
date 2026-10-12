# Brief 4A: professional WhatsApp messages and the prescription photo

**Builder:** Opus 5.5, effort high. **End-to-end port:** `E2E_PORT=3101`. Read [README.md](README.md) first (shared rules).

**Owner's request (12 Oct 2026):** "Attach Photo of the prescription to the Whatsapp Message. Also make the Whatsapp Message look and sound very professional by using text styling."

## 1. Every message to a patient looks and sounds professional
Rewrite the clinic-to-patient messages with WhatsApp text styling: `*bold*`, `_italic_`, lists with `- ` at the start of a line, and a few purposeful emoji (📅 🕗 📍) at most. Short lines that read well on a phone; no walls of text. Rules that stay: only the patient's **first name** (never age, gender, phone or anything else about them); amounts with `formatRupees`; times with the existing helpers.
- **Visit message** (`visitMessage` in `src/lib/billing.ts`): a header (`*Smile Dental Clinic*`, then `_Dr. Rahil Yusuf, BDS_`: the qualification is the first part of `siteConfig.dentist.qualifications`), "Dear <first name>,", one line thanking them for the visit on the visit's date, then sections with bold headings: treatment and charges as a list, total, paid (with method), balance due or advance (bold), other visits' dues and total due when there are any, the next appointment (day, date, time, and the clinic's short location), then "For any questions, call or WhatsApp us on <phone>." and a sign-off ("Warm regards," `*Dr. Rahil Yusuf*`, "Smile Dental Clinic, Katapadi"). Sections with nothing in them are left out (a visit with only a next appointment, or only a prescription, still reads well).
- **Confirmation, moved and decline messages** (`src/lib/whatsapp.ts`): the same header, greeting and sign-off; confirmation and moved show the day, date and time in bold, the address and the directions link (`siteConfig.googleReviewsLink`), and "Please arrive 5 minutes early." in italics.
- The website's patient-to-clinic request message stays plain (it is for the clinic).
- Put 2–3 real example outputs in your report (visit with bill + part payment + next visit + prescription; confirmation; moved), so the orchestrator can show the owner.

## 2. The prescription goes as a real photo
A `wa.me` link can only fill in text. The only way a web app can attach a photo on Android is the share sheet (Web Share API with files). So:
- **Step 1, unchanged flow:** "Send on WhatsApp" opens the patient's chat with the message (the chat now exists, even for a new walk-in).
- **Step 2:** when photos are ticked and the phone can share files (`navigator.canShare({ files })`), the Send section then shows a big green **"Send prescription photo"** button (or "Send 2 photos"). It opens the share sheet with the ticked photos attached and a short caption ("Prescription · Smile Dental Clinic · 12 Oct 2026"; X-ray / Photo for other kinds). The patient's chat is at the top of WhatsApp's recent chats, so it is one tap to pick. Show it right after he comes back from WhatsApp, and keep it available (he may send it again).
- **Files ready before the tap:** Android allows the share sheet only within a few seconds of the tap, so fetch the ticked photos as `File`s ahead of time (from the 1-hour display links, when the page loads and when ticks change), and call `navigator.share` straight from the tap. If a file isn't ready yet, show "Preparing photo…" and enable the button when it is.
- **With file sharing**, the text message carries **no photo links** and `markWhatsappSent` gets no photo ids (so no 30-day links are made). **Without it** (desktop, older browsers), keep today's behaviour: 30-day links in the text.
- Keep every guarantee of the Send flow: it waits for saves still on their way, WhatsApp opens within 2 s of the tap or the big "Open WhatsApp" button appears, "Still trying…" after 15 s, nothing is saved twice.

## Files only you edit
`src/lib/billing.ts` (+ `billing.test.ts`), `src/lib/whatsapp.ts` (+ its test if present, or add `whatsapp.test.ts`), `src/components/clinic/SendWhatsApp.tsx`, `src/components/clinic/VisitFlow.tsx` (only if needed to pass photos), `src/lib/actions/visits.ts` (`markWhatsappSent` only), `src/lib/actions/appointments.ts` (only where it builds message text), `e2e/visit.spec.ts`, `e2e/times.spec.ts`, `e2e/helpers.ts`, `tour/tour.spec.ts`. No database changes, no new packages.

## Tests
- Unit: each message's text (headings, first name only, sections left out when empty, no photo links when sharing files).
- E2E (Playwright can't open a real share sheet): stub `navigator.canShare`/`navigator.share` with `page.addInitScript` to capture what is shared; check that after Send the "Send prescription photo" button shares one image file with the caption, and that the WhatsApp text has the new layout and no storage link. A second test without `canShare` checks the 30-day link fallback.

## Done when
All gates pass, including `E2E_PORT=3101 npx playwright test` (all four files).
