import { beforeEach, describe, expect, it } from 'vitest'
import type { VisitBill } from '@/lib/data/billing'
import { applyOutbox, sentWaiting, shownNextVisit } from './apply'
import { clearOutbox, enqueue, isNetworkError, markFailed, readOutbox } from './outbox'

const VISIT = 'visit-1'
const charge = (id: string, description: string, amount: number) =>
  ({ visitId: VISIT, action: 'addCharge' as const, args: [VISIT, { description, amount, treatmentSlug: null }, id] })
const payment = (id: string, amount: number) => ({ visitId: VISIT, action: 'recordPayment' as const, args: [VISIT, amount, 'cash', id] })

beforeEach(() => clearOutbox())

describe('the outbox', () => {
  it('keeps saves in order', () => {
    enqueue(charge('c1', 'X-ray', 350))
    enqueue(payment('p1', 350))
    expect(readOutbox().map((i) => i.action)).toEqual(['addCharge', 'recordPayment'])
  })

  it('drops a charge or payment taken back while it was still waiting', () => {
    enqueue(charge('c1', 'X-ray', 350))
    enqueue(payment('p1', 350))
    enqueue({ visitId: VISIT, action: 'removeCharge', args: ['c1'] })
    enqueue({ visitId: VISIT, action: 'removePayment', args: ['p1'] })
    expect(readOutbox()).toEqual([])
  })

  it('queues removing a charge the server already has', () => {
    enqueue({ visitId: VISIT, action: 'removeCharge', args: ['saved-1'] })
    expect(readOutbox().map((i) => i.action)).toEqual(['removeCharge'])
  })

  it('keeps only the latest kind for a photo', () => {
    enqueue({ visitId: VISIT, action: 'setPhotoKind', args: ['photo-1', 'X-ray'] })
    enqueue({ visitId: VISIT, action: 'setPhotoKind', args: ['photo-1', 'Prescription'] })
    expect(readOutbox().map((i) => i.args[1])).toEqual(['Prescription'])
  })

  it('keeps only the latest next visit: a new time replaces one waiting, and removing it drops the booking but still goes', () => {
    enqueue({ visitId: VISIT, action: 'bookNextVisit', args: [VISIT, '2026-10-24T04:30:00.000Z', 30] })
    enqueue({ visitId: VISIT, action: 'bookNextVisit', args: [VISIT, '2026-10-26T05:00:00.000Z', 60] })
    expect(readOutbox().map((i) => i.args[1])).toEqual(['2026-10-26T05:00:00.000Z'])
    enqueue({ visitId: VISIT, action: 'removeNextVisit', args: [VISIT] })
    expect(readOutbox().map((i) => i.action)).toEqual(['removeNextVisit'])
  })

  it('records the send once, after what was waiting before it', () => {
    enqueue(charge('c1', 'X-ray', 350))
    enqueue({ visitId: VISIT, action: 'markWhatsappSent', args: [VISIT] })
    enqueue({ visitId: VISIT, action: 'markWhatsappSent', args: [VISIT] })
    expect(readOutbox().map((i) => i.action)).toEqual(['addCharge', 'markWhatsappSent'])
  })

  it('tells no signal from a refusal', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('fetch failed'))).toBe(true)
    expect(isNetworkError(new Error('That visit was not found.'))).toBe(false)
  })
})

describe('the bill with what is waiting', () => {
  const bill: VisitBill = {
    visit: { id: VISIT, visit_date: '2026-10-22' },
    patient: { id: 'p', name: 'Asha', phone: null },
    charges: [{ id: 'c0', description: 'Consultation', amount: 600, kind: 'item' }],
    payments: [],
    summary: { total: 600, paid: 0, balance: 600, earlier: 0, due: 600 },
  }

  it('shows the server bill unchanged when nothing waits', () => {
    expect(applyOutbox(bill, [])).toBe(bill)
  })

  it('adds waiting charges and payments, takes out removed ones, and works out the totals again', () => {
    enqueue(charge('c1', 'X-ray', 350))
    enqueue(payment('p1', 500))
    enqueue({ visitId: VISIT, action: 'removeCharge', args: ['c0'] })
    const shown = applyOutbox(bill, readOutbox())
    expect(shown.charges.map((c) => [c.id, c.pending ?? false])).toEqual([['c1', true]])
    expect(shown.payments.map((p) => [p.id, p.amount, p.pending])).toEqual([['p1', 500, true]])
    expect(shown.summary).toEqual({ total: 350, paid: 500, balance: -150, earlier: 0, due: -150 })
  })

  it('does not count twice a save the server already has', () => {
    enqueue(charge('c0', 'Consultation', 600))
    expect(applyOutbox(bill, readOutbox()).summary.total).toBe(600)
  })

  it('ignores other visits and saves the server turned down', () => {
    enqueue({ ...charge('c9', 'Other visit', 100), visitId: 'visit-2' })
    enqueue(charge('c8', 'Refused', 100))
    markFailed(readOutbox()[1].id, 'That visit was not found.')
    expect(applyOutbox(bill, readOutbox())).toBe(bill)
  })
})

describe('the next visit and the send with what is waiting', () => {
  const server = { starts_at: '2026-10-24T04:30:00.000Z', duration_min: 30 }
  const book = (startsAt: string, minutes: number) => ({ visitId: VISIT, action: 'bookNextVisit' as const, args: [VISIT, startsAt, minutes] })

  it("is the server's when nothing waits", () => {
    expect(shownNextVisit(VISIT, server, [])).toEqual({ startsAt: server.starts_at, minutes: 30, pending: false })
    expect(shownNextVisit(VISIT, null, [])).toBeNull()
  })

  it('is the one booked on the phone while it waits, and none once removing it waits', () => {
    enqueue(book('2026-10-26T05:00:00.000Z', 60))
    expect(shownNextVisit(VISIT, server, readOutbox())).toEqual({ startsAt: '2026-10-26T05:00:00.000Z', minutes: 60, pending: true })
    enqueue({ visitId: VISIT, action: 'removeNextVisit', args: [VISIT] })
    expect(shownNextVisit(VISIT, server, readOutbox())).toBeNull()
  })

  it("goes back to the server's when the booking was turned down", () => {
    enqueue(book('2026-10-26T05:00:00.000Z', 60))
    markFailed(readOutbox()[0].id, 'That time was just taken. Please choose another.')
    expect(shownNextVisit(VISIT, server, readOutbox())).toEqual({ startsAt: server.starts_at, minutes: 30, pending: false })
  })

  it('knows a send still waiting to be recorded', () => {
    expect(sentWaiting(VISIT, readOutbox())).toBe(false)
    enqueue({ visitId: VISIT, action: 'markWhatsappSent', args: [VISIT] })
    expect(sentWaiting(VISIT, readOutbox())).toBe(true)
    expect(sentWaiting('visit-2', readOutbox())).toBe(false)
  })
})
