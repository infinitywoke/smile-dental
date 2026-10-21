import { describe, expect, it } from 'vitest'
import { sentStreak } from './streak'

const today = '2026-10-21'

describe('the all-sent streak', () => {
  it('counts the days in a row, up to yesterday, when every visit was sent', () => {
    const days = new Map([['2026-10-20', true], ['2026-10-19', true], ['2026-10-18', true], ['2026-10-17', false], ['2026-10-15', true]])
    expect(sentStreak(days, today)).toBe(3)
  })

  it('skips days with no visits, and ignores today', () => {
    // Friday the 16th had no visits; today is still under way
    const days = new Map([[today, false], ['2026-10-20', true], ['2026-10-17', true], ['2026-10-15', true]])
    expect(sentStreak(days, today)).toBe(3)
  })

  it('is nothing after a day with a visit left unsent', () => {
    expect(sentStreak(new Map([['2026-10-20', false], ['2026-10-19', true]]), today)).toBe(0)
    expect(sentStreak(new Map(), today)).toBe(0)
  })
})
