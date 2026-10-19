# Tally and Clinic OS

## Built (19 Oct 2026): Send to Tally
- **Way in:** the "Money today" card at the bottom of Today shows today's cash and UPI and opens **Send to Tally** (`/app/tally`).
- **Ledger names, typed once:** cash ledger (default `Cash`, which every Tally company has), the bank ledger UPI lands in, and the income ledger. They must match Tally exactly, or Tally refuses the file. Stored in `tally_settings` (`supabase/tally-2026-10.sql`).
- **Entries:** one receipt per payment (narration `Name - Cash - visit 12 Oct 2026`), or one per day for cash and one for UPI.
- **New payments:** the file holds only payments recorded since the last file (by when they were recorded, so a mid-day file is fine), so nothing is imported twice. The first file can start on a chosen day, to leave out days already typed into Tally. **Download again** repeats the last file. **A whole month** (for the accountant) changes nothing.
- **Format:** Tally XML receipt vouchers (`src/lib/tally.ts`): Dr the cash ledger (cash) or the bank ledger (UPI), Cr the income ledger, dated in India time. TallyPrime: Import → Transactions. Tally.ERP 9: Gateway of Tally → Import of Data → Vouchers.
- **Not covered:** bills (sales vouchers), dues, expenses, GST. A payment removed in Clinic OS after its file was imported must also be removed in Tally.
- **Before relying on it:** import one day's file into a test or backup company first. Confirm with Dr. Rahil and his accountant: the ledger names, and each payment or daily totals.

## The original proposal (12 Oct)

*12 Oct 2026. Owner: "Rahil uses Tally to keep a record of his accounts… see what features we can integrate to make our app much smarter and intelligent while keeping it simple." Written from what TallyPrime offers; check the details with Dr. Rahil before building.*

## The idea in one line
Tally stays his book of accounts. Clinic OS already knows every charge and every payment (cash or UPI, per patient, per day), so it should **feed Tally instead of being typed into it twice**, and borrow the few Tally reports that help a clinic every day.

## What Tally does (the parts that matter here)
| Tally feature | What it is | In Clinic OS today |
|---|---|---|
| Ledgers and groups | Accounts: Cash, Bank, "Treatment income", patients as Sundry Debtors | Payments are cash or UPI; no ledgers |
| Receipt / Sales / Payment / Contra vouchers | Money in, bills, money out, cash deposited to bank | Charges (bills) and payments (money in) per visit |
| Bill-wise outstanding + ageing | Who owes what, and for how long | "Needs you → Collect" (no ageing) |
| Day Book, Cash Book, Bank Book | Everything entered today; cash and bank movements | Nothing per day |
| Bank reconciliation | Match bank statement lines with entries | Nothing |
| Cost centres / categories | Income split by department or activity | Charges carry the price-list treatment |
| Reminder letters | Payment reminders to debtors | Nothing |
| Profit & Loss, Balance Sheet, Cash Flow | Year-end and monthly statements | Out of scope (stay in Tally) |
| GST, TDS, payroll, inventory | Tax returns, salaries, stock | Out of scope (dental treatment is generally GST-exempt; cosmetic work may not be: his accountant decides) |
| Edit log (audit trail) | Every change kept, required for companies | A removed payment is deleted outright |
| Import from Excel / XML | Vouchers can be imported instead of typed | Nothing exported |

## What to add, simplest and most useful first
1. **(Built, as "Money today")** **Day-end money (one card on Today, after the last patient):** "Today: ₹4,200 cash · ₹6,500 UPI · 9 patients · ₹1,200 still due". The cash figure is what the drawer should hold, like Tally's Cash Book in one line. No new data; one tap to share it on WhatsApp with his accountant if he wants.
2. **(Built)** **Send to Tally (no double entry):** a monthly (or daily) file Tally imports in one step: one Receipt voucher per payment (Dr Cash or Dr his bank ledger for UPI, Cr his income ledger), narration "Prakash · 12 Oct · Scaling". Format: Excel for TallyPrime's "Import from Excel", or Tally XML. He picks his ledger names once in Clinic OS.
3. **Dues with their age, and a polite reminder:** Collect shows "₹1,700 · 34 days"; one tap opens a professional WhatsApp reminder (same style as the visit message). Like Tally's bill-wise ageing and reminder letters, without the jargon.
4. **Month at a glance:** income by treatment (from the price list), cash vs UPI, new vs returning patients, money still owed. Like Tally's cost-centre reports; this is also the analytics the owner wants later.
5. **Later, only if he wants them:** a kept record of removed payments (audit trail, matches Tally's edit log and the logic audit's "money never silently disappears"); matching UPI payments with the bank statement (bank reconciliation); lab bills per patient (crown lab fees) to see what each treatment really earns.

## Questions for Dr. Rahil (before building)
1. Which Tally (TallyPrime version)? Does he enter **each patient's payment** or **one total per day**?
2. His ledger names: cash, the bank account UPI lands in, and the income ledger(s).
3. Does his accountant need anything else each month (a summary, a file)?
4. Does he want lab bills and other expenses in Clinic OS, or keep them only in Tally? (Simplest: keep them in Tally.)

## Fits the app's rules
- One dentist, Android first: each item is one card or one button, no accounting words on screen ("Day-end money", not "Cash Book").
- Money comes from the one rule in the logic audit (`patientAccount`), so the day-end card, dues, reminders and the Tally file always agree with every screen.
- Only the patient's first name goes in messages; the Tally file stays on his phone or goes to his accountant, never to an outside AI service.
