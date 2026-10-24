import type { VisitBill } from '@/lib/data/billing'
import { DEFAULT_LENGTH } from '@/lib/schedule'
import { subjectOf, type QueuedSave } from './outbox'

export type ShownCharge = VisitBill['charges'][number] & { pending?: boolean }
export type ShownPayment = VisitBill['payments'][number] & { pending?: boolean }
export type ShownBill = Omit<VisitBill, 'charges' | 'payments'> & { charges: ShownCharge[]; payments: ShownPayment[] }

const round = (n: number) => Math.round(n * 100) / 100

// The next visit as the doctor should see it: one booked, moved or removed on this phone and still
// waiting to be saved goes before the server's (pending while it waits)
export function shownNextVisit(
  visitId: string,
  server: { starts_at: string; duration_min: number } | null,
  items: QueuedSave[],
): { startsAt: string; minutes: number; pending: boolean } | null {
  const waiting = items.filter((i) => i.visitId === visitId && !i.error && (i.action === 'bookNextVisit' || i.action === 'removeNextVisit')).at(-1)
  if (!waiting) return server ? { startsAt: server.starts_at, minutes: server.duration_min, pending: false } : null
  if (waiting.action === 'removeNextVisit') return null
  return { startsAt: String(waiting.args[1]), minutes: Number(waiting.args[2]) || DEFAULT_LENGTH, pending: true }
}

// "WhatsApp sent" is recorded on this phone and waits to be saved
export const sentWaiting = (visitId: string, items: QueuedSave[]) =>
  items.some((i) => i.visitId === visitId && !i.error && i.action === 'markWhatsappSent')

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
      const input = i.args[1] as { description: string; amount: number; treatmentSlug: string | null; discount?: boolean }
      // A discount is typed as an amount off, and kept below zero
      return input.discount
        ? { id: subjectOf(i), description: input.description, amount: -input.amount, kind: 'discount' as const, pending: true }
        : { id: subjectOf(i), description: input.description, amount: input.amount, kind: input.treatmentSlug ? ('item' as const) : ('extra' as const), pending: true }
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
