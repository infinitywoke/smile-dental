import { afterEach, describe, expect, it, vi } from 'vitest'
import { ageOn, formatDate, todayInIndia } from './dates'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('todayInIndia', () => {
  // India is UTC+5:30, so the date changes at 18:30 UTC
  it('is still the same day just before midnight IST', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T18:29:00Z'))
    expect(todayInIndia()).toBe('2026-10-09')
  })

  it('moves to the next day just after midnight IST', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T18:31:00Z'))
    expect(todayInIndia()).toBe('2026-10-10')
  })

  it('is ahead of UTC in the early morning', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T20:00:00Z'))
    expect(todayInIndia()).toBe('2027-01-01')
  })

  it('ignores the server timezone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T19:00:00Z'))
    expect(todayInIndia()).toBe('2026-10-10')
  })
})

describe('formatDate', () => {
  it('formats as day, short month, year', () => {
    expect(formatDate('2026-10-15')).toBe('15 Oct 2026')
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026')
  })

  it('accepts custom options', () => {
    const text = formatDate('2026-10-10', { weekday: 'long', day: 'numeric', month: 'long' })
    expect(text).toContain('Saturday')
    expect(text).toContain('10 October')
  })

  it('never shifts the day, whatever the server timezone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    expect(formatDate('2026-10-15')).toBe('15 Oct 2026')
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    expect(formatDate('2026-10-15')).toBe('15 Oct 2026')
  })
})

describe('ageOn', () => {
  it('counts the year only once the birthday is reached', () => {
    expect(ageOn('1990-10-10', '2026-10-09')).toBe(35)
    expect(ageOn('1990-10-10', '2026-10-10')).toBe(36)
    expect(ageOn('1990-10-10', '2026-10-11')).toBe(36)
  })

  it('handles birthdays later in the year and earlier months', () => {
    expect(ageOn('1990-12-01', '2026-10-10')).toBe(35)
    expect(ageOn('1990-03-20', '2026-10-10')).toBe(36)
  })

  it('treats a leap-day birthday as reached on 1 March in other years', () => {
    expect(ageOn('2000-02-29', '2025-02-28')).toBe(24)
    expect(ageOn('2000-02-29', '2025-03-01')).toBe(25)
    expect(ageOn('2000-02-29', '2024-02-28')).toBe(23)
    expect(ageOn('2000-02-29', '2024-02-29')).toBe(24)
  })

  it('is 0 for a baby born today', () => {
    expect(ageOn('2026-10-10', '2026-10-10')).toBe(0)
  })

  it('defaults to today in India', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T18:31:00Z'))
    expect(ageOn('1990-10-10')).toBe(36)
    vi.setSystemTime(new Date('2026-10-09T18:29:00Z'))
    expect(ageOn('1990-10-10')).toBe(35)
  })
})
