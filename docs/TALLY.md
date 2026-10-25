# Tally and Clinic OS

## Built (19 Oct 2026): Send to Tally
- **Way in:** the "Money today" card at the bottom of Today shows today's cash and UPI and opens **Send to Tally** (`/app/tally`).
- **Ledger names, typed once:** cash ledger (default `Cash`, which every Tally company has), the bank ledger UPI lands in, and the income ledger. They must match Tally exactly, or Tally refuses the file. Stored in `tally_settings` (`supabase/tally-2026-10.sql`).
- **Entries:** one receipt per payment (narration `Name - Cash - visit 12 Oct 2026`), or one per day for cash and one for UPI.
- **New payments:** the file holds only payments recorded since the last file (by when they were recorded, so a mid-day file is fine), so nothing is imported twice. The first file can start on a chosen day, to leave out days already typed into Tally. **Download again** repeats the last file. **A whole month** (for the accountant) changes nothing.
- **Format:** Tally XML receipt vouchers (`src/lib/tally.ts`): Dr the cash ledger (cash) or the bank ledger (UPI), Cr the income ledger, dated in India time. TallyPrime: Import → Transactions. Tally.ERP 9: Gateway of Tally → Import of Data → Vouchers.
- **Not covered:** bills (sales vouchers), dues, expenses, GST. A payment removed in Clinic OS after its file was imported must also be removed in Tally.
- **Dr. Rahil's answers (owner, 19 Oct):** Tally.ERP 9; ledgers "Cash" and "Bank of Baroda" (filled in for him, from `siteConfig.tally`); the accountant needs nothing else each month; lab bills and other expenses stay in Tally only. Still open: the income ledger's name, and each payment or one total per day.
- **Before relying on it:** import one day's file into a test or backup company first.

## Dr. Rahil's Day Book (owner, 24 Oct 2026)

The owner shared a Day Book export (Tally.ERP 9, company "SMILE DENTAL0", receipts of 7-9 Sep 2026; UTF-16 XML). Kept out of the repo: it holds patient names, ages, places and clinical notes. What it shows about how his books are kept:

| | His Day Book | Clinic OS export until now |
|---|---|---|
| Voucher | Receipt, numbered by Tally (641, 642, ...) | Receipt, numbered by Tally |
| Money in (Dr) | `Cash`, or `Savings A/C` for UPI/bank | `Cash`, or the bank ledger saved on the screen (`Bank of Baroda`) |
| Credited (Cr) | **Each patient's own ledger**, named name + age + place, like `Asha 40 Katapadi` or `Asha40Katapadi` (an invented example; the spacing varies) | One income ledger (saved as `Shin`, which looks like a test entry) |
| Party ledger | `PARTYLEDGERNAME` = the cash or bank ledger | not set |
| Narration | His clinical note in his shorthand: teeth, treatment, medicines (invented example: `3[6] RCT started, IOPA done`) | `Name - Cash - visit 12 Oct 2026` |
| Amount | Cr patient +amount (ISDEEMEDPOSITIVE No), Dr Cash -amount (Yes) | the same convention |

So a Clinic OS file as saved today would be refused: `Bank of Baroda` and `Shin` are not ledgers in his company. To match his books exactly:
1. **Bank ledger `Savings A/C`** (done 24 Oct: the screen's default; the saved name still has to be changed once on the screen).
2. **Party ledger and narration** (done 24 Oct): each receipt names its cash or bank ledger as Tally does, and the narration lists the visit's treatments.
3. **Credit each patient's own ledger** (waiting for the owner): name + age + place from the patient's record, and a ledger created in the same file for a patient Tally doesn't have yet. Needs: the group his patient ledgers sit under (Sundry Debtors, or an income group), and whether to match his existing ledger names (a list exported from Tally) so old patients don't get a second ledger.
4. **Before relying on it:** import one day into a backup company and compare its Day Book with this one.

## His company, from the full exports and settings (25 Oct 2026)

The owner saved `docs/tally/Master.xml` (List of Accounts, 4 MB) and `docs/tally/DayBook.xml` (Day Book, 18–24 Oct 2026). Both are UTF-16 LE, in Tally's own import envelope (`<ENVELOPE>` → `IMPORTDATA` → `TALLYMESSAGE`, one master or voucher each). The folder is git-ignored because it holds patient data. The owner also sent screenshots of the company settings.

**Company:** Tally.ERP 9 Release 1 (TallyGold, multi-user); company `SMILE DENTAL0`, Katapady, Udupi; books from 1 Apr 2025, current period 1 Apr 2026 – 31 Mar 2027. It is set to Accounts with Inventory, with an Income/Expense statement instead of P&L. Bill-wise details are on, including for non-trading accounts, and so are interest calculation, payroll and zero-valued entries. Cost centres, multi-currency and every tax (VAT, service tax, excise, TDS, TCS, FBT) are off; there is no GST and no PAN.

**What the List of Accounts holds:**
- **865 ledgers:**
    - **846 under Direct Incomes:** one per patient, named name + age + place. The spacing and case vary (invented examples: `Asha40Katapadi`, `Asha 40 Katapadi`, `Asha 40 Udupi/Family`). The same person can have two ledgers because the age in the name changed (`Asha40…` and `Asha42…`).
    - **Money in:** `Cash` (Cash-in-hand) and `Savings A/C` (Bank Accounts). There is no `Bank of Baroda` or `Shin` ledger.
    - **Costs, all under Indirect Expenses:** rent, electricity, clinic expenses, a dental lab, and a second lab under its own group `FPD LAB CHARGES`. The `Doctors Commission` group holds 7 visiting specialists (endodontists, oral surgeon, orthodontist, pedodontist, implants). `Salaries` holds 1 employee ledger, and there is an `Assistants` cost centre. Ask Rahil whether these are past or current.
    - **Others:** `BDS Education Loan`, `Random Expenditures`, `Profit & Loss A/c`, and `CashIncomes` (under Capital Account; looks unused).
- **Groups:** Tally's 28 plus 7 of his own. One of them, `Patient Details`, sits under Capital Account but holds **no ledgers**; ignore it.
- **No stock items:** only 8 empty stock groups (Endo, Prostho, …) and the default godown, so stock stays in Clinic OS.
- **Voucher types:** Tally's 20 defaults. Receipt is numbered automatically and restarts every year on 1 April.

**What the Day Book holds:** 31 vouchers over 18–24 Oct 2026, every one a **Receipt**, numbered in sequence from 826. Each has exactly two lines:
- **Credit:** the patient's ledger, +amount, ISDEEMEDPOSITIVE No.
- **Debit:** `Cash` (17 receipts) or `Savings A/C` (14), −amount, ISDEEMEDPOSITIVE Yes, ISPARTYLEDGER Yes; this is also `PARTYLEDGERNAME`.

The vouchers have no bill allocations, cost centres or inventory lines, and the narration is his clinical note. One receipt has **no amount at all** (zero-valued entries are on): he records a visit with no payment as a receipt too.

**What this means for Send to Tally:**
1. **Credit the patient's own ledger under Direct Incomes.** This answers the open question: income is booked straight to the patient ledger, with no Sundry Debtors and no separate fee ledger. The single "income ledger" setting goes.
2. **Match old patients to their existing ledgers.** Matching takes a one-time upload of his List of Accounts on the Tally screen. Only Direct Incomes ledger names are kept, and each is matched to a Clinic OS patient on name + place with spacing, case and age ignored, because the age changes. Rahil confirms the doubtful matches, and the result is saved per patient (`patients.tally_ledger`, a database change that needs the owner's OK).
3. **New patients get a ledger in the same file:** a `<LEDGER NAME="…" ACTION="Create">` under Direct Incomes, written before the vouchers and named the way he names them (name age place).
4. **Keep:** `Cash` / `Savings A/C`, PARTYLEDGERNAME and the sign convention (already as his). Tally numbers the vouchers, so the file sends no voucher number. The narration lists the visit's treatments.
5. **To test in the backup company:**
    - whether ERP 9 Release 1 takes our UTF-8 file (his exports are UTF-16);
    - whether a receipt with no bill allocation is accepted on a bill-wise ledger;
    - whether a `REMOTEID` set to the payment's id stops a second import from making duplicates.
6. **Answered (owner, 25 Oct):** yes, he wants the zero-amount receipts; yes, the employee and the visiting specialists are current.

**Built 25 Oct** (`supabase/tally-patient-ledgers-2026-10.sql`, applied live; `src/lib/tally-ledgers.ts`):
- **Each payment credits the patient's own ledger** (`patients.tally_ledger`).
    - A patient without one gets a name the first time a file needs it, for example `Asha Rao 40 Katapadi`: the place is the address up to the first comma, in plain letters, with " 2" added if another patient has the name.
    - The name is saved, so every later file uses the same ledger.
    - Until his List of Accounts shows it (`tally_ledger_listed`), each file creates it first: a LEDGER under Direct Incomes, bill-wise, with no ACTION (so Tally creates it if missing).
- **Matching** (Send to Tally → Patient ledgers → "Match from your List of Accounts"):
    - The phone or PC reads the export (UTF-16 or UTF-8). Only the Direct Incomes ledger names go to the server.
    - A ledger Clinic OS named that his list now has is marked at once.
    - For the rest, a sure match (one ledger fits name, age within −1 to +3 years, and place) is preselected. The others show up to 5 options, or "None of these".
    - One ledger can't go to two patients.
    - On his real list: 846 patient ledgers read; 13 share a name and place with another ledger (age duplicates), so they are always questions.
- **Narration:** "Name - treatments - Cash/UPI/nothing paid - visit date - notes". The visit's notes are put on one line ("; " between lines), on its first receipt on the visit's own day only, at most 1,000 characters.
- **Download month** is the file to bring a whole month into Tally. With "each payment" it holds every payment received and every visit with nothing paid in the month, plus the new ledgers. Receipts already imported are refused by REMOTEID; receipts he typed by hand can't be recognised, so he stops typing the ones Clinic OS sends.
- **Visits with nothing paid** (charges or notes, no payment) are receipts with no amounts, dated the visit's day, narration "Name - treatments - nothing paid - visit date". This applies only to "each payment".
- **Each receipt has `REMOTEID="clinic-os-payment-<id>"`** (or `clinic-os-visit-<id>`), so a second import of the same file is refused instead of doubled.
- **The income ledger** is asked for only with "one per day"; it keeps the old behaviour and creates no ledgers.
- **Delete patient** with "keep the money" clears the ledger name (it holds name, age and place).

**Still to do:** import one real day into a backup copy of `SMILE DENTAL0` and compare it with his Day Book. Check that:
- the new ledgers are created by Import of Data → Vouchers (if not, offer them as a separate Masters file);
- a no-amount receipt is accepted;
- a second import is refused per receipt.

**Built in (25 Oct):** `siteConfig.tally` holds his company `SMILE DENTAL0`, `Cash`, `Savings A/C` and the patient group Direct Incomes. The screen needs no setup, and every file names the company (`SVCURRENTCOMPANY`), so Tally imports only into `SMILE DENTAL0`: a test in a backup copy must keep that name. The live saved settings were corrected (`Savings A/C`; no income ledger). None of his 5 Clinic OS patients was a sure match; 3 wait for him to confirm on the Patient ledgers screen (upload `Master.xml` there).
    - Costs are not sent to Tally: he said on 19 Oct that expenses and lab bills stay in Tally. For the lab-fee question, his books treat a lab fee as an expense when it is paid.

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
