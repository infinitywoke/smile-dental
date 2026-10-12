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

export type BillSummary = {
  total: number
  paid: number
  // This visit's balance: billed minus paid (negative = paid more than billed)
  balance: number
  // What the patient owes (positive) or has in advance (negative) from their other visits
  earlier: number
  // Everything still due, other visits included
  due: number
}

export function summarise(args: {
  charges: { amount: number }[]
  payments: { amount: number }[]
  earlier: number
}): BillSummary {
  const total = sumAmounts(args.charges)
  const paid = sumAmounts(args.payments)
  const balance = Math.round((total - paid) * 100) / 100
  const due = Math.round((balance + args.earlier) * 100) / 100
  return { total, paid, balance, earlier: args.earlier, due }
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

  if (summary && (lines.length > 0 || payments.length > 0)) {
    out.push('', '*Payment*')
    if (summary.paid > 0) {
      const methods = [...new Set(payments.map((p) => (p.method === 'upi' ? 'UPI' : 'Cash')))].join(' + ')
      out.push(`Paid: ${formatRupees(summary.paid)}${methods ? ` (${methods})` : ''}`)
    }
    if (summary.balance > 0) out.push(`*Balance due: ${formatRupees(summary.balance)}*`)
    else if (summary.balance < 0) out.push(`*Advance with us: ${formatRupees(-summary.balance)}*`)
    else if (summary.paid > 0) out.push('*Paid in full.* Thank you!')
    if (summary.earlier !== 0) {
      out.push(
        summary.earlier > 0
          ? `Due from other visits: ${formatRupees(summary.earlier)}`
          : `Advance from other visits: ${formatRupees(-summary.earlier)}`,
        summary.due > 0
          ? `*Total due: ${formatRupees(summary.due)}*`
          : summary.due < 0
            ? `*Total advance with us: ${formatRupees(-summary.due)}*`
            : '*Nothing due.*',
      )
    }
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

