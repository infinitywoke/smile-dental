import { describe, expect, it } from 'vitest'
import { isEmptyVisit, photoKind, visitStatus } from './visit-status'

describe('visitStatus', () => {
  it('says "no bill" until something is charged', () => {
    expect(visitStatus({ closedAt: null, total: 0, paid: 0 })).toEqual({ money: 'none', due: 0, sent: false })
    expect(visitStatus({ closedAt: undefined, total: 0, paid: 500 }).money).toBe('none')
  })

  it('shows what is still due, and paid once covered', () => {
    expect(visitStatus({ closedAt: null, total: 1500, paid: 0 })).toEqual({ money: 'due', due: 1500, sent: false })
    expect(visitStatus({ closedAt: null, total: 1500, paid: 1000 })).toEqual({ money: 'due', due: 500, sent: false })
    expect(visitStatus({ closedAt: null, total: 1500, paid: 1500 })).toEqual({ money: 'paid', due: 0, sent: false })
    expect(visitStatus({ closedAt: null, total: 1500, paid: 2000 })).toEqual({ money: 'paid', due: 0, sent: false })
    expect(visitStatus({ closedAt: null, total: 0.3, paid: 0.1 }).due).toBe(0.2)
  })

  it('records the WhatsApp separately from the money', () => {
    expect(visitStatus({ closedAt: '2026-10-15T10:00:00Z', total: 1500, paid: 0 })).toEqual({ money: 'due', due: 1500, sent: true })
    expect(visitStatus({ closedAt: '2026-10-15T10:00:00Z', total: 0, paid: 0 })).toEqual({ money: 'none', due: 0, sent: true })
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
