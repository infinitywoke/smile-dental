import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, todayInIndia } from './dates'

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

