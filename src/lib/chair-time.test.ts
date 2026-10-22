import { describe, expect, it } from 'vitest'
import { chairTime } from './chair-time'

describe('time in the chair', () => {
  const start = '2026-10-22T05:00:00.000Z'
  const at = (seconds: number) => new Date(Date.parse(start) + seconds * 1000)

  it('counts minutes and seconds, then hours', () => {
    expect(chairTime(start, at(0))).toBe('0:00')
    expect(chairTime(start, at(18 * 60 + 42))).toBe('18:42')
    expect(chairTime(start, at(3600 + 5 * 60 + 9))).toBe('1:05:09')
  })

  it('stops after three hours, and never runs backwards', () => {
    expect(chairTime(start, at(3 * 3600))).toBeNull()
    expect(chairTime(start, at(-30))).toBe('0:00')
  })
})
