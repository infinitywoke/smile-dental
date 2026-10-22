import { describe, expect, it } from 'vitest'
import { chairTime, visitProgress, type VisitState } from './visit-progress'

const blank: VisitState = { notes: '', charges: 0, total: 0, paid: 0, due: 0, next: false, sent: false, resend: false }
const filled = (v: Partial<VisitState>) => Object.fromEntries(visitProgress({ ...blank, ...v }).map((s) => [s.key, s.filled]))

describe('visit progress', () => {
  it('starts empty, in order', () => {
    const steps = visitProgress(blank)
    expect(steps.map((s) => s.label)).toEqual(['Notes', 'Bill', 'Paid', 'Next', 'Sent'])
    expect(steps.every((s) => s.filled === 0)).toBe(true)
    expect(steps.find((s) => s.key === 'paid')!.state).toBe('nothing to pay yet')
  })

  it('fills each step as the visit goes', () => {
    expect(filled({ notes: 'Pain 36', charges: 2, total: 3850, paid: 3850, due: 0, next: true, sent: true })).toEqual({ notes: 1, bill: 1, paid: 1, next: 1, sent: 1 })
    expect(filled({ notes: '   ' }).notes).toBe(0)
  })

  it('fills Paid as the bill is paid, and full once nothing is owed', () => {
    expect(filled({ charges: 1, total: 4000, paid: 1000, due: 3000 }).paid).toBe(0.25)
    // An advance from before covers it
    expect(filled({ charges: 1, total: 500, paid: 0, due: 0 }).paid).toBe(1)
    // Paid more than this visit's bill, toward an older one
    expect(filled({ charges: 1, total: 500, paid: 800, due: 200 }).paid).toBe(1)
    expect(visitProgress({ ...blank, charges: 1, total: 4000, paid: 1000, due: 3000 }).find((s) => s.key === 'paid')!.state).toBe('₹3,000 due')
  })

  it('a bill changed after sending is half sent', () => {
    const sent = visitProgress({ ...blank, sent: true, resend: true }).find((s) => s.key === 'sent')!
    expect(sent.filled).toBe(0.5)
    expect(sent.state).toBe('bill changed, send again')
  })
})

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
