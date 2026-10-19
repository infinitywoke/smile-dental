import { formatDate } from '@/lib/dates'
import { inIndia } from '@/lib/schedule'

// Send to Tally: payments as Tally receipt vouchers in Tally's XML import format, which TallyPrime and
// Tally.ERP 9 both read (Import → Transactions). Each receipt takes the money into the cash ledger (cash)
// or the bank ledger (UPI) and credits the income ledger. Tally refuses a file whose ledger names don't
// exist in the company, so the dentist types his own names once.

export type TallyLedgers = { cash: string; bank: string; income: string }
// One receipt per payment, or one per day for each of cash and UPI
export type TallyEntries = 'payment' | 'day'
export type TallyPayment = {
  id: string
  amount: number
  method: 'cash' | 'upi'
  receivedAt: string // ISO
  patientName: string
  visitDate: string // YYYY-MM-DD
}

type Voucher = { date: string; debitLedger: string; amount: number; narration: string }

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
// Tally's dates are YYYYMMDD; plain ASCII words in the narration (Tally versions differ on other characters)
const tallyDate = (date: string) => date.replace(/-/g, '')
const plain = (s: string) => s.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim()
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2)
const methodLabel = (m: TallyPayment['method']) => (m === 'upi' ? 'UPI' : 'Cash')

export function tallyVouchers(payments: TallyPayment[], ledgers: TallyLedgers, entries: TallyEntries, clinicName: string): Voucher[] {
  const ledgerFor = (m: TallyPayment['method']) => (m === 'upi' ? ledgers.bank : ledgers.cash)
  const sorted = [...payments].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  if (entries === 'payment') {
    return sorted.map((p) => ({
      date: inIndia(p.receivedAt).date,
      debitLedger: ledgerFor(p.method),
      amount: p.amount,
      narration: plain(`${p.patientName} - ${methodLabel(p.method)} - visit ${formatDate(p.visitDate)}`),
    }))
  }
  // One per day and method, in date order, cash first
  const days = new Map<string, { date: string; method: TallyPayment['method']; amount: number; count: number }>()
  for (const p of sorted) {
    const date = inIndia(p.receivedAt).date
    const key = `${date}|${p.method === 'cash' ? 0 : 1}`
    const day = days.get(key) ?? { date, method: p.method, amount: 0, count: 0 }
    day.amount += p.amount
    day.count += 1
    days.set(key, day)
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, d]) => ({
    date: d.date,
    debitLedger: ledgerFor(d.method),
    amount: d.amount,
    narration: plain(`${clinicName} - ${d.count} ${methodLabel(d.method)} payment${d.count === 1 ? '' : 's'} - ${formatDate(d.date)}`),
  }))
}

// The whole import file. Debits are negative with ISDEEMEDPOSITIVE Yes, credits positive with No (Tally's convention).
export function tallyXml(payments: TallyPayment[], ledgers: TallyLedgers, entries: TallyEntries, clinicName: string): string {
  const vouchers = tallyVouchers(payments, ledgers, entries, clinicName).map((v) => [
    '    <TALLYMESSAGE xmlns:UDF="TallyUDF">',
    '     <VOUCHER VCHTYPE="Receipt" ACTION="Create">',
    `      <DATE>${tallyDate(v.date)}</DATE>`,
    '      <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>',
    `      <NARRATION>${xml(v.narration)}</NARRATION>`,
    '      <ALLLEDGERENTRIES.LIST>',
    `       <LEDGERNAME>${xml(v.debitLedger)}</LEDGERNAME>`,
    '       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>',
    `       <AMOUNT>-${money(v.amount)}</AMOUNT>`,
    '      </ALLLEDGERENTRIES.LIST>',
    '      <ALLLEDGERENTRIES.LIST>',
    `       <LEDGERNAME>${xml(ledgers.income)}</LEDGERNAME>`,
    '       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>',
    `       <AMOUNT>${money(v.amount)}</AMOUNT>`,
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
    '   </REQUESTDESC>',
    '   <REQUESTDATA>',
    ...vouchers,
    '   </REQUESTDATA>',
    '  </IMPORTDATA>',
    ' </BODY>',
    '</ENVELOPE>',
    '',
  ].join('\n')
}

// What a file holds, to check against Tally after the import
export function tallyTotals(payments: TallyPayment[]) {
  const sum = (m: TallyPayment['method']) => payments.filter((p) => p.method === m).reduce((t, p) => t + p.amount, 0)
  return { count: payments.length, cash: sum('cash'), upi: sum('upi') }
}

// Ledger names as typed: trimmed, 1–100 characters
export function cleanLedger(value: unknown): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length >= 1 && text.length <= 100 ? text : null
}
