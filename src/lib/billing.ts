import { formatRupees } from '@/lib/pricing'
import { formatDate } from '@/lib/dates'
import { appointmentLines, messageHeader, messageSignOff, QUESTIONS_LINE, SHORT_LOCATION } from '@/lib/whatsapp'

// Money is added in paise so 0.1 + 0.2 never shows as 0.30000000000000004
export function sumAmounts(items: { amount: number }[]): number {
  return items.reduce((paise, item) => paise + Math.round(item.amount * 100), 0) / 100
}

export const MAX_AMOUNT = 1_000_000

// Photo links in one WhatsApp message
export const MAX_PHOTOS_TO_SEND = 10

// A rupee amount typed by hand: "1,250", "₹ 1250.50". Returns null when it isn't a sensible amount.
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]|rs\.?/gi, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value <= MAX_AMOUNT ? value : null
}

// One visit's money, as the `visit_money` view gives it
export type VisitMoney = { id: string; date: string; createdAt: string; charged: number; paid: number }

export type PatientAccount = {
  // All the patient's charges minus all their payments: positive is owed, negative is an advance
  owed: number
  // What is still owed on each visit; whenever something is owed, the parts add up to `owed`
  dueByVisit: Map<string, number>
}

// The one money rule every screen uses: Today, the patient page, the visit page and the WhatsApp message.
// A payment pays its own visit first; anything extra pays the oldest visit still unpaid; what is left
// over is an advance. Worked in paise, so the parts always add up.
export function patientAccount(visits: VisitMoney[]): PatientAccount {
  const paise = (n: number) => Math.round(n * 100)
  const oldestFirst = [...visits].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  let extra = 0
  let charged = 0
  let paid = 0
  const due = new Map<string, number>()
  for (const v of oldestFirst) {
    const c = paise(v.charged)
    const p = paise(v.paid)
    charged += c
    paid += p
    due.set(v.id, Math.max(c - p, 0))
    extra += Math.max(p - c, 0)
  }
  for (const v of oldestFirst) {
    const use = Math.min(due.get(v.id)!, extra)
    due.set(v.id, due.get(v.id)! - use)
    extra -= use
  }
  return { owed: (charged - paid) / 100, dueByVisit: new Map([...due].map(([id, d]) => [id, d / 100])) }
}

// The patient's newest visit that still has a part owed: where "Collect" goes
export function newestVisitOwing(visits: VisitMoney[], account: PatientAccount): string | null {
  const newestFirst = [...visits].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  return newestFirst.find((v) => (account.dueByVisit.get(v.id) ?? 0) > 0)?.id ?? null
}

// Rows of the `visit_money` view, as the money rule reads them
export function visitMoneyOf(rows: { visit_id: string; visit_date: string; created_at: string; charged: number | string; paid: number | string }[]): VisitMoney[] {
  return rows.map((r) => ({ id: r.visit_id, date: r.visit_date, createdAt: r.created_at, charged: Number(r.charged), paid: Number(r.paid) }))
}

// Why a visit that holds money can't be deleted, naming the amounts
export function paymentsHeldMessage(payments: { amount: number; method: 'upi' | 'cash' }[]): string {
  const cash = sumAmounts(payments.filter((p) => p.method === 'cash'))
  const upi = sumAmounts(payments.filter((p) => p.method === 'upi'))
  const parts = [cash > 0 && `cash ${formatRupees(cash)}`, upi > 0 && `UPI ${formatRupees(upi)}`].filter(Boolean).join(', ')
  return `This visit holds ${formatRupees(sumAmounts(payments))} in payments (${parts}). If they were a mistake, remove them in Payment first, then delete the visit.`
}

export type BillSummary = {
  // This visit's charges and payments
  total: number
  paid: number
  // This visit's balance: billed minus paid (negative = paid more than billed)
  balance: number
  // The patient's other visits together: owed (positive) or an advance (negative)
  earlier: number
  // What the patient owes, all visits together (patientAccount's `owed`); negative is an advance
  due: number
}

// This visit's bill, with what the patient owes across all visits (patientAccount's `owed`)
export function summarise(args: {
  charges: { amount: number }[]
  payments: { amount: number }[]
  owed: number
}): BillSummary {
  const total = sumAmounts(args.charges)
  const paid = sumAmounts(args.payments)
  const balance = Math.round((total - paid) * 100) / 100
  const due = Math.round(args.owed * 100) / 100
  return { total, paid, balance, earlier: Math.round((due - balance) * 100) / 100, due }
}

// The one WhatsApp message after a visit, laid out for a phone: a header, the treatment and charges,
// what was paid and what is still due, the next appointment, and (only on phones that can't share
// the photos themselves) a 30-day link to each photo, named by its kind. Sections with nothing in
// them are left out. First name only; nothing else about the patient.
export function visitMessage(args: {
  patientName: string
  visitDate: string
  lines?: { description: string; amount: number }[]
  payments?: { amount: number; method: 'upi' | 'cash' }[]
  summary?: BillSummary | null
  nextAppointment?: { starts_at: string } | null
  photos?: { label: string; url: string }[]
}): string {
  const out = [...messageHeader(args.patientName), `Thank you for visiting us on ${formatDate(args.visitDate)}.`]
  const lines = args.lines ?? []
  const payments = args.payments ?? []
  const summary = args.summary

  if (summary && lines.length > 0) {
    out.push(
      '',
      '*Treatment & charges*',
      ...lines.map((line) => `- ${line.description || 'Charge'}: ${formatRupees(line.amount)}`),
      `*Total: ${formatRupees(summary.total)}*`,
    )
  }

  // This visit's payments, the other visits in one line, then one bold line: what the patient owes
  // (all visits together) or has in advance. Nothing charged, paid or owed: no Payment section.
  if (summary && (summary.total > 0 || summary.paid > 0 || summary.due !== 0)) {
    out.push('', '*Payment*')
    if (summary.paid > 0) {
      const methods = [...new Set(payments.map((p) => (p.method === 'upi' ? 'UPI' : 'Cash')))].join(' + ')
      out.push(`Paid: ${formatRupees(summary.paid)}${methods ? ` (${methods})` : ''}`)
    }
    if (summary.earlier > 0) out.push(`Due from other visits: ${formatRupees(summary.earlier)}`)
    else if (summary.earlier < 0) out.push(`Advance from other visits: ${formatRupees(-summary.earlier)}`)
    if (summary.due > 0) out.push(`*Balance due: ${formatRupees(summary.due)}*`)
    else if (summary.due < 0) out.push(`*Advance with us: ${formatRupees(-summary.due)}*`)
    else out.push('*Paid in full.* Thank you!')
  }

  if (args.nextAppointment?.starts_at) {
    out.push('', '*Next appointment*', ...appointmentLines(args.nextAppointment.starts_at), SHORT_LOCATION)
  }

  const photos = args.photos ?? []
  if (photos.length > 0) {
    out.push('', photos.length === 1 ? '*Your photo* _(the link works for 30 days)_' : '*Your photos* _(the links work for 30 days)_')
    const counts = new Map<string, number>()
    for (const photo of photos) counts.set(photo.label, (counts.get(photo.label) ?? 0) + 1)
    const seen = new Map<string, number>()
    for (const photo of photos) {
      const n = (seen.get(photo.label) ?? 0) + 1
      seen.set(photo.label, n)
      out.push(`- ${photo.label}${counts.get(photo.label)! > 1 ? ` ${n}` : ''}: ${photo.url}`)
    }
  }

  out.push('', QUESTIONS_LINE, ...messageSignOff())
  return out.join('\n')
}

