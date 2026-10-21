import { describe, expect, it } from 'vitest'
import { LUNCH_SPAN, dayPosition, nextAppointment, ringDash, stripBlock } from './cockpit'

const ist = (hhmm: string) => `2026-10-21T${hhmm}:00+05:30`

describe('the Cockpit day strip', () => {
  it('runs from 8:30 AM to 7:50 PM, clamped at its ends', () => {
    expect(dayPosition(ist('08:30'))).toBe(0)
    expect(dayPosition(ist('19:50'))).toBe(100)
    expect(dayPosition(ist('07:00'))).toBe(0)
    expect(dayPosition(ist('21:00'))).toBe(100)
    expect(dayPosition(ist('14:10'))).toBeCloseTo(50, 0)
  })

  it('marks lunch, and each appointment as over, under way or to come', () => {
    expect(LUNCH_SPAN.left).toBeCloseTo(41.2, 1)
    const now = new Date(ist('10:42'))
    expect(stripBlock(ist('09:10'), 40, now).state).toBe('done')
    expect(stripBlock(ist('10:30'), 40, now).state).toBe('now')
    expect(stripBlock(ist('11:10'), 60, now)).toMatchObject({ state: 'booked', left: expect.closeTo(23.5, 1), width: expect.closeTo(8.8, 1) })
    expect(stripBlock(ist('19:10'), 80, now).width).toBeLessThanOrEqual(100 - stripBlock(ist('19:10'), 80, now).left)
  })
})

describe('the seen ring and the next patient', () => {
  it('fills the ring by the part seen', () => {
    expect(ringDash(4, 9, 578)).toBe('256.9 578.0')
    expect(ringDash(0, 0, 578)).toBe('0.0 578.0')
    expect(ringDash(12, 9, 578)).toBe('578.0 578.0')
  })

  it('takes the first booked appointment not yet over', () => {
    const booked = [
      { id: 'b', starts_at: ist('11:10'), duration_min: 60 },
      { id: 'a', starts_at: ist('10:30'), duration_min: 40 },
      { id: 'c', starts_at: ist('12:30'), duration_min: 40 },
    ]
    expect(nextAppointment(booked, new Date(ist('10:42')))?.id).toBe('a')
    expect(nextAppointment(booked, new Date(ist('11:15')))?.id).toBe('b')
    expect(nextAppointment(booked, new Date(ist('13:20')))).toBeNull()
  })
})
