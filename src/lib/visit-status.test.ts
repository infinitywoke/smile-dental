import { describe, expect, it } from 'vitest'
import { isEmptyVisit, photoKind, visitStatus } from './visit-status'

describe('visitStatus', () => {
  const open = { closedAt: null, total: 0, paid: 0, due: 0 }

  it('says "no bill" with nothing charged and nothing paid, ₹0 lines included', () => {
    expect(visitStatus(open)).toEqual({ money: 'none', due: 0, sent: false, resend: false })
  })

  it('says "paid ahead" when money was paid and nothing charged', () => {
    expect(visitStatus({ ...open, paid: 600 }).money).toBe('ahead')
  })

  it("shows this visit's part of what is owed, and paid once covered (by any visit's money)", () => {
    expect(visitStatus({ ...open, total: 1500, due: 1500 })).toEqual({ money: 'due', due: 1500, sent: false, resend: false })
    expect(visitStatus({ ...open, total: 1500, paid: 1000, due: 500 }).due).toBe(500)
    expect(visitStatus({ ...open, total: 1500, paid: 1500, due: 0 }).money).toBe('paid')
    expect(visitStatus({ ...open, total: 1500, paid: 2000, due: 0 }).money).toBe('paid')
    // Unpaid here, but covered by an advance on another visit
    expect(visitStatus({ ...open, total: 500, paid: 0, due: 0 }).money).toBe('paid')
    expect(visitStatus({ ...open, total: 0.3, paid: 0.1, due: 0.2 }).due).toBe(0.2)
  })

  it('records the WhatsApp separately from the money, and says when the bill changed after it', () => {
    const sent = { ...open, closedAt: '2026-10-15T10:00:00Z' }
    expect(visitStatus({ ...sent, total: 1500, due: 1500 })).toEqual({ money: 'due', due: 1500, sent: true, resend: false })
    expect(visitStatus({ ...sent, resendNeeded: true })).toEqual({ money: 'none', due: 0, sent: true, resend: true })
    // Never "send again" for a visit that was never sent
    expect(visitStatus({ ...open, resendNeeded: true }).resend).toBe(false)
  })
})

describe('isEmptyVisit', () => {
  const empty = { notes: '', photos: 0, charges: 0, payments: 0 }
  it('is empty with nothing in it', () => {
    expect(isEmptyVisit(empty)).toBe(true)
    expect(isEmptyVisit({ ...empty, notes: '  \n ' })).toBe(true)
    expect(isEmptyVisit({ ...empty, notes: null })).toBe(true)
  })
  it('is not empty with notes, a photo, a charge or a payment', () => {
    expect(isEmptyVisit({ ...empty, notes: 'Pain' })).toBe(false)
    expect(isEmptyVisit({ ...empty, photos: 1 })).toBe(false)
    expect(isEmptyVisit({ ...empty, charges: 1 })).toBe(false)
    expect(isEmptyVisit({ ...empty, payments: 1 })).toBe(false)
  })
})

describe('photoKind', () => {
  it('reads the one-tap kinds and older typed captions', () => {
    expect(photoKind('Prescription')).toBe('Prescription')
    expect(photoKind('Rx for pain')).toBe('Prescription')
    expect(photoKind('X-ray')).toBe('X-ray')
    expect(photoKind('xray 46')).toBe('X-ray')
    expect(photoKind('CT scan')).toBe('X-ray')
    expect(photoKind('Other')).toBe('Other')
    expect(photoKind('')).toBeNull()
    expect(photoKind('Smile before')).toBeNull()
  })
})
