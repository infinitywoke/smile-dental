import type { VisitBill } from '@/lib/data/billing'
import { subjectOf, type QueuedSave } from './outbox'

export type ShownCharge = VisitBill['charges'][number] & { pending?: boolean }
export type ShownPayment = VisitBill['payments'][number] & { pending?: boolean }
export type ShownBill = Omit<VisitBill, 'charges' | 'payments'> & { charges: ShownCharge[]; payments: ShownPayment[] }

const round = (n: number) => Math.round(n * 100) / 100

// The bill as the doctor should see it: what the server has, plus what is waiting on this phone to be
// saved (marked pending), less what he removed while it waited. The totals and what is due follow.
export function applyOutbox(bill: VisitBill, items: QueuedSave[]): ShownBill {
  const mine = items.filter((i) => i.visitId === bill.visit.id && !i.error)
  if (mine.length === 0) return bill

  const removedCharges = new Set(mine.filter((i) => i.action === 'removeCharge').map(subjectOf))
  const removedPayments = new Set(mine.filter((i) => i.action === 'removePayment').map(subjectOf))
  const serverCharges = new Set(bill.charges.map((c) => c.id))
  const serverPayments = new Set(bill.payments.map((p) => p.id))

  const addedCharges: ShownCharge[] = mine
    .filter((i) => i.action === 'addCharge' && !serverCharges.has(subjectOf(i)))
    .map((i) => {
      const input = i.args[1] as { description: string; amount: number; treatmentSlug: string | null }
      return { id: subjectOf(i), description: input.description, amount: input.amount, kind: input.treatmentSlug ? 'item' : 'extra', pending: true }
    })
  const addedPayments: ShownPayment[] = mine
    .filter((i) => i.action === 'recordPayment' && !serverPayments.has(subjectOf(i)))
    .map((i) => ({
      id: subjectOf(i),
      amount: Number(i.args[1]),
      method: i.args[2] as ShownPayment['method'],
      received_at: new Date(i.at).toISOString(),
      pending: true,
    }))

  const keptCharges = bill.charges.filter((c) => !removedCharges.has(c.id))
  const keptPayments = bill.payments.filter((p) => !removedPayments.has(p.id))
  const charges = [...keptCharges, ...addedCharges]
  const payments = [...keptPayments, ...addedPayments]

  const sum = (rows: { amount: number }[]) => rows.reduce((total, r) => total + Number(r.amount), 0)
  const billed = round(sum(charges) - sum(bill.charges))
  const paid = round(sum(payments) - sum(bill.payments))
  const total = round(bill.summary.total + billed)
  const paidNow = round(bill.summary.paid + paid)
  return {
    ...bill,
    charges,
    payments,
    summary: { ...bill.summary, total, paid: paidNow, balance: round(total - paidNow), due: round(bill.summary.due + billed - paid) },
  }
}
