import { formatDate } from '@/lib/dates'
import { inIndia } from '@/lib/schedule'
import { PATIENT_GROUP } from '@/lib/tally-ledgers'

// Send to Tally: payments as Tally receipt vouchers in Tally's XML import format, which TallyPrime and
// Tally.ERP 9 both read (Import → Transactions). Each receipt takes the money into the cash ledger (cash)
// or the bank ledger (UPI) and credits the patient's own ledger, as his Day Book does (or, one per day, the
// income ledger). A visit with nothing paid is a receipt with no amount: he keeps those as visit notes.
// Tally refuses a file whose ledger names don't exist in the company, so the dentist types his cash and
// bank names once, and a patient ledger Tally doesn't have yet is created at the top of the file.

export type TallyLedgers = { cash: string; bank: string; income: string | null }
// One receipt per payment, or one per day for each of cash and UPI
export type TallyEntries = 'payment' | 'day'
export type TallyPayment = {
  id: string
  // 0: a visit with nothing paid (one receipt per payment only)
  amount: number
  method: 'cash' | 'upi'
  receivedAt: string // ISO
  patientName: string
  visitDate: string // YYYY-MM-DD
  // What was done at the visit (its bill lines), for the narration: "Root canal (46), X-ray"
  treatments?: string[]
  // The visit and the dentist's notes on it, which his Day Book keeps in the narration
  visitId?: string
  notes?: string
  // The patient's ledger in Tally, and whether this file must create it
  ledger?: { name: string; create: boolean }
}

type Voucher = { id: string | null; date: string; debitLedger: string; creditLedger: string; amount: number; narration: string }

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
// Tally's dates are YYYYMMDD; plain ASCII words in the narration (Tally versions differ on other characters)
const tallyDate = (date: string) => date.replace(/-/g, '')
const plain = (s: string) => s.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim()
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2)
const methodLabel = (m: TallyPayment['method']) => (m === 'upi' ? 'UPI' : 'Cash')
// The visit's notes on one line, as he writes them in Tally: each line a clause, bullets and section
// headings' colons kept, at most 1,000 characters
const noteLine = (notes: string | undefined) =>
  plain((notes ?? '').split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).join('; ')).slice(0, 1000)

export function tallyVouchers(payments: TallyPayment[], ledgers: TallyLedgers, entries: TallyEntries, clinicName: string): Voucher[] {
  const ledgerFor = (m: TallyPayment['method']) => (m === 'upi' ? ledgers.bank : ledgers.cash)
  const sorted = [...payments].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  if (entries === 'payment') {
    // The visit's notes go with its first receipt on the visit's own day; a part payment or a balance paid
    // later names the visit only
    const noted = new Set<string>()
    return sorted.map((p) => {
      const onTheDay = !!p.visitId && !noted.has(p.visitId) && inIndia(p.receivedAt).date === p.visitDate
      const notes = onTheDay ? noteLine(p.notes) : ''
      if (onTheDay) noted.add(p.visitId!)
      return {
        // Tally knows the receipt by this, so the same payment imported twice is refused, not doubled
        id: `${p.amount > 0 ? 'clinic-os-payment' : 'clinic-os-visit'}-${p.id}`,
        date: inIndia(p.receivedAt).date,
        debitLedger: ledgerFor(p.method),
        creditLedger: p.ledger?.name ?? ledgers.income ?? '',
        amount: p.amount,
        narration: [plain([p.patientName, (p.treatments ?? []).join(', ').slice(0, 200), p.amount > 0 ? methodLabel(p.method) : 'nothing paid', `visit ${formatDate(p.visitDate)}`].filter(Boolean).join(' - ')), notes].filter(Boolean).join(' - '),
      }
    })
  }
  // One per day and method, in date order, cash first; visits with nothing paid have no place here
  const days = new Map<string, { date: string; method: TallyPayment['method']; amount: number; count: number }>()
  for (const p of sorted.filter((x) => x.amount > 0)) {
    const date = inIndia(p.receivedAt).date
    const key = `${date}|${p.method === 'cash' ? 0 : 1}`
    const day = days.get(key) ?? { date, method: p.method, amount: 0, count: 0 }
    day.amount += p.amount
    day.count += 1
    days.set(key, day)
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, d]) => ({
    id: null,
    date: d.date,
    debitLedger: ledgerFor(d.method),
    creditLedger: ledgers.income ?? '',
    amount: d.amount,
    narration: plain(`${clinicName} - ${d.count} ${methodLabel(d.method)} payment${d.count === 1 ? '' : 's'} - ${formatDate(d.date)}`),
  }))
}

// The whole import file. Debits are negative with ISDEEMEDPOSITIVE Yes, credits positive with No (Tally's convention);
// the cash or bank ledger is also the voucher's party ledger, as in Tally's own Day Book export. A receipt
// with nothing paid has no amounts, as his own do. New patient ledgers come first, under Direct Incomes,
// bill-wise like his (no ACTION: Tally creates one it doesn't have and leaves the rest as they are).
// With his company named (as his own exports do), Tally imports only into that company, never into another
// one that happens to be open.
export function tallyXml(payments: TallyPayment[], ledgers: TallyLedgers, entries: TallyEntries, clinicName: string, company = ''): string {
  const created = entries === 'payment'
    ? [...new Set(payments.filter((p) => p.ledger?.create).map((p) => p.ledger!.name))]
    : []
  const masters = created.map((name) => [
    '    <TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `     <LEDGER NAME="${xml(name)}">`,
    '      <NAME.LIST>',
    `       <NAME>${xml(name)}</NAME>`,
    '      </NAME.LIST>',
    `      <PARENT>${xml(PATIENT_GROUP)}</PARENT>`,
    '      <ISBILLWISEON>Yes</ISBILLWISEON>',
    '     </LEDGER>',
    '    </TALLYMESSAGE>',
  ].join('\n'))
  const amount = (sign: '' | '-', v: Voucher) => (v.amount > 0 ? [`       <AMOUNT>${sign}${money(v.amount)}</AMOUNT>`] : [])
  const vouchers = tallyVouchers(payments, ledgers, entries, clinicName).map((v) => [
    '    <TALLYMESSAGE xmlns:UDF="TallyUDF">',
    `     <VOUCHER${v.id ? ` REMOTEID="${xml(v.id)}"` : ''} VCHTYPE="Receipt" ACTION="Create">`,
    `      <DATE>${tallyDate(v.date)}</DATE>`,
    '      <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>',
    `      <PARTYLEDGERNAME>${xml(v.debitLedger)}</PARTYLEDGERNAME>`,
    `      <NARRATION>${xml(v.narration)}</NARRATION>`,
    '      <ALLLEDGERENTRIES.LIST>',
    `       <LEDGERNAME>${xml(v.debitLedger)}</LEDGERNAME>`,
    '       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>',
    '       <ISPARTYLEDGER>Yes</ISPARTYLEDGER>',
    ...amount('-', v),
    '      </ALLLEDGERENTRIES.LIST>',
    '      <ALLLEDGERENTRIES.LIST>',
    `       <LEDGERNAME>${xml(v.creditLedger)}</LEDGERNAME>`,
    '       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>',
    ...amount('', v),
    '      </ALLLEDGERENTRIES.LIST>',
    '     </VOUCHER>',
    '    </TALLYMESSAGE>',
  ].join('\n'))
  return [
    '<ENVELOPE>',
    ' <HEADER>',
    '  <TALLYREQUEST>Import Data</TALLYREQUEST>',
    ' </HEADER>',
    ' <BODY>',
    '  <IMPORTDATA>',
    '   <REQUESTDESC>',
    '    <REPORTNAME>Vouchers</REPORTNAME>',
    ...(company ? ['    <STATICVARIABLES>', `     <SVCURRENTCOMPANY>${xml(company)}</SVCURRENTCOMPANY>`, '    </STATICVARIABLES>'] : []),
    '   </REQUESTDESC>',
    '   <REQUESTDATA>',
    ...masters,
    ...vouchers,
    '   </REQUESTDATA>',
    '  </IMPORTDATA>',
    ' </BODY>',
    '</ENVELOPE>',
    '',
  ].join('\n')
}

// What a file holds, to check against Tally after the import (visits with nothing paid counted apart)
export function tallyTotals(payments: TallyPayment[]) {
  const paid = payments.filter((p) => p.amount > 0)
  const sum = (m: TallyPayment['method']) => paid.filter((p) => p.method === m).reduce((t, p) => t + p.amount, 0)
  return { count: paid.length, cash: sum('cash'), upi: sum('upi'), unpaid: payments.length - paid.length }
}

// Ledger names as typed: trimmed, 1–100 characters
export function cleanLedger(value: unknown): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length >= 1 && text.length <= 100 ? text : null
}

// Tally's own groups: headings that ledgers sit under. A voucher must name a ledger, so a group typed as
// a ledger name (often "Direct Incomes" for fees) would make Tally refuse the file.
const TALLY_GROUPS = [
  'Branch / Divisions', 'Capital Account', 'Current Assets', 'Current Liabilities', 'Direct Expenses', 'Direct Incomes',
  'Fixed Assets', 'Indirect Expenses', 'Indirect Incomes', 'Investments', 'Loans (Liability)', 'Misc. Expenses (ASSET)',
  'Purchase Accounts', 'Sales Accounts', 'Suspense A/c', 'Bank Accounts', 'Bank OD A/c', 'Cash-in-Hand', 'Deposits (Asset)',
  'Duties & Taxes', 'Loans & Advances (Asset)', 'Provisions', 'Reserves & Surplus', 'Secured Loans', 'Stock-in-Hand',
  'Sundry Creditors', 'Sundry Debtors', 'Unsecured Loans',
]
const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '').replace(/s$/, '')
export function tallyGroupNamed(name: string): string | null {
  return TALLY_GROUPS.find((g) => squash(g) === squash(name)) ?? null
}
