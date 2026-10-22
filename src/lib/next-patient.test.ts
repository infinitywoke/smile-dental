import { describe, expect, it } from 'vitest'
import { nextAppointment, nextTiming } from './next-patient'

const at = (iso: string) => new Date(iso)

describe('the next patient', () => {
  it('takes the first booked appointment not yet over', () => {
    const booked = [
      { id: 'c', starts_at: '2026-10-22T08:40:00.000Z', duration_min: 40 },
      { id: 'a', starts_at: '2026-10-22T03:00:00.000Z', duration_min: 40 },
      { id: 'b', starts_at: '2026-10-22T05:00:00.000Z', duration_min: 60 },
    ]
    expect(nextAppointment(booked, at('2026-10-22T04:00:00.000Z'))?.id).toBe('b')
    // Under way still counts as next until it is over
    expect(nextAppointment(booked, at('2026-10-22T05:30:00.000Z'))?.id).toBe('b')
    expect(nextAppointment(booked, at('2026-10-22T06:00:00.000Z'))?.id).toBe('c')
    expect(nextAppointment(booked, at('2026-10-22T10:00:00.000Z'))).toBeNull()
  })

  it('says how near the time is, or how late', () => {
    const start = '2026-10-22T05:30:00.000Z'
    expect(nextTiming(start, at('2026-10-22T05:18:00.000Z'))).toEqual({ text: 'in 12 min', lateBy: 0 })
    expect(nextTiming(start, at('2026-10-22T03:25:00.000Z'))).toEqual({ text: 'in 2 h 5 min', lateBy: 0 })
    expect(nextTiming(start, at('2026-10-22T04:30:00.000Z'))).toEqual({ text: 'in 1 h', lateBy: 0 })
    expect(nextTiming(start, at('2026-10-22T05:30:20.000Z'))).toEqual({ text: 'now', lateBy: 0 })
    expect(nextTiming(start, at('2026-10-22T05:38:00.000Z'))).toEqual({ text: '8 min late', lateBy: 8 })
  })
})
