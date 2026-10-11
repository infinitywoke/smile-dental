import { siteConfig } from '@/config/site'
import { formatRupees } from '@/lib/pricing'
import { formatDate } from '@/lib/dates'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'

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

// The one WhatsApp message after a visit: bill, payments, balance, next appointment and a link to
// each photo sent, named by its kind ("Prescription: <link>"). First name only; never gender.
export function visitMessage(args: {
  patientName: string
  visitDate: string
  lines?: { description: string; amount: number }[]
  payments?: { amount: number; method: 'upi' | 'cash' }[]
  summary?: BillSummary | null
  nextAppointment?: { starts_at: string } | null
  photos?: { label: string; url: string }[]
}): string {
  const first = args.patientName.trim().split(/\s+/)[0]
  const out = [
    `Hello ${first}, thank you for visiting ${siteConfig.name} on ${formatDate(args.visitDate)}.`,
  ]

  if (args.lines && args.lines.length > 0 && args.summary) {
    out.push(
      '',
      '*Bill*',
      ...args.lines.map((line) => `• ${line.description || 'Charge'}: ${formatRupees(line.amount)}`),
      `*Total: ${formatRupees(args.summary.total)}*`,
    )
    if (args.summary.paid > 0 && args.payments && args.payments.length > 0) {
      const methods = [...new Set(args.payments.map((p) => (p.method === 'upi' ? 'UPI' : 'cash')))].join(' + ')
      out.push(`Paid: ${formatRupees(args.summary.paid)}${methods ? ` (${methods})` : ''}`)
    }
    if (args.summary.balance > 0) out.push(`Balance: ${formatRupees(args.summary.balance)}`)
    if (args.summary.balance < 0) out.push(`Advance with us: ${formatRupees(-args.summary.balance)}`)
    if (args.summary.earlier > 0) out.push(`Due from other visits: ${formatRupees(args.summary.earlier)}`, `*Total due: ${formatRupees(args.summary.due)}*`)
  }

  if (args.nextAppointment?.starts_at) {
    const { date, time } = inIndia(args.nextAppointment.starts_at)
    out.push('', `*Next appointment*`, `📅 ${formatDay(date)}, ${formatBlock(time)}`)
  }

  if (args.photos && args.photos.length > 0) {
    out.push('', '*Photos* (links work for 30 days)')
    const counts = new Map<string, number>()
    for (const photo of args.photos) counts.set(photo.label, (counts.get(photo.label) ?? 0) + 1)
    const seen = new Map<string, number>()
    for (const photo of args.photos) {
      const n = (seen.get(photo.label) ?? 0) + 1
      seen.set(photo.label, n)
      out.push(`${photo.label}${counts.get(photo.label)! > 1 ? ` ${n}` : ''}: ${photo.url}`)
    }
  }

  out.push('', `Thank you!`, `– ${siteConfig.dentist.name}`)
  return out.join('\n')
}
