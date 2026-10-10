import { siteConfig } from '@/config/site'
import { formatRupees } from '@/lib/pricing'
import { formatDate } from '@/lib/dates'

// Money is added in paise so 0.1 + 0.2 never shows as 0.30000000000000004
export function sumAmounts(items: { amount: number }[]): number {
  return items.reduce((paise, item) => paise + Math.round(item.amount * 100), 0) / 100
}

export const MAX_AMOUNT = 1_000_000

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
  // What the patient owed (positive) or had in advance (negative) before this visit
  earlier: number
  // Everything still due, earlier balance included
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

// The WhatsApp message to the patient after the visit: bill, payment and balance
export function billMessage(args: {
  patientName: string
  visitDate: string
  lines: { description: string; amount: number }[]
  payments: { amount: number; method: 'upi' | 'cash' }[]
  summary: BillSummary
}): string {
  const first = args.patientName.trim().split(/\s+/)[0]
  const { summary } = args
  const out = [
    `Hello ${first}, thank you for visiting ${siteConfig.name} on ${formatDate(args.visitDate)}.`,
    '',
    '*Bill*',
    ...args.lines.map((line) => `• ${line.description || 'Charge'}: ${formatRupees(line.amount)}`),
    `*Total: ${formatRupees(summary.total)}*`,
  ]
  if (summary.paid > 0) {
    const methods = [...new Set(args.payments.map((p) => (p.method === 'upi' ? 'UPI' : 'cash')))].join(' + ')
    out.push(`Paid: ${formatRupees(summary.paid)}${methods ? ` (${methods})` : ''}`)
  }
  if (summary.balance > 0) out.push(`Balance: ${formatRupees(summary.balance)}`)
  if (summary.balance < 0) out.push(`Advance with us: ${formatRupees(-summary.balance)}`)
  if (summary.earlier > 0) out.push(`Earlier balance: ${formatRupees(summary.earlier)}`, `*Total due: ${formatRupees(summary.due)}*`)
  out.push('', `Thank you!`, `– ${siteConfig.dentist.name}`)
  return out.join('\n')
}
