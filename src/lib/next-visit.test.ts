import { describe, expect, it } from 'vitest'
import { pickSuggestedTime, suggestedDate } from './next-visit'

describe('suggestedDate', () => {
  it('is the same weekday one week later', () => {
    expect(suggestedDate('2026-10-12')).toBe('2026-10-19') // Monday to Monday
  })

  it('skips Friday', () => {
    expect(suggestedDate('2026-10-09')).toBe('2026-10-17') // Friday 16th is closed, so Saturday
  })

  it('crosses month ends', () => {
    expect(suggestedDate('2026-10-28')).toBe('2026-11-04')
  })
})

describe('pickSuggestedTime', () => {
  it('keeps the usual time when it is free', () => {
    expect(pickSuggestedTime('10:30', ['09:10', '10:30', '14:30'])).toBe('10:30')
  })

  it('falls back to the first free time', () => {
    expect(pickSuggestedTime('10:30', ['09:10', '14:30'])).toBe('09:10')
    expect(pickSuggestedTime(null, ['11:10', '14:30'])).toBe('11:10')
  })

  it('returns nothing when the day is full', () => {
    expect(pickSuggestedTime('10:30', [])).toBeNull()
  })
})

describe('suggestedDate after another gap', () => {
  it('counts the days asked for, still skipping a Friday', () => {
    expect(suggestedDate('2026-10-12', 3)).toBe('2026-10-15') // Monday to Thursday
    expect(suggestedDate('2026-10-13', 3)).toBe('2026-10-17') // Friday 16th is closed, so Saturday
    expect(suggestedDate('2026-10-12', 30)).toBe('2026-11-11')
    expect(suggestedDate('2026-10-12', 182)).toBe('2027-04-12')
  })
})
