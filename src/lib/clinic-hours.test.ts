import { describe, expect, it } from 'vitest'
import { openStatus } from './clinic-hours'
import { blockInstant } from './schedule'

// Wednesday 21 October 2026; Thursday the 22nd; Friday (closed) the 23rd
const at = (date: string, hhmm: string) => new Date(blockInstant(date, hhmm))

describe('openStatus', () => {
  it('says the clinic is open, and until when', () => {
    expect(openStatus(at('2026-10-21', '10:00'))).toEqual({ open: true, text: 'Open now · until 1:00 PM' })
    expect(openStatus(at('2026-10-21', '19:29'))).toEqual({ open: true, text: 'Open now · until 7:30 PM' })
  })

  it('says when it opens next', () => {
    expect(openStatus(at('2026-10-21', '07:15')).text).toBe('Opens today at 8:30 AM')
    expect(openStatus(at('2026-10-21', '13:00')).text).toBe('Closed for lunch · opens at 2:30 PM')
    expect(openStatus(at('2026-10-21', '19:30')).text).toBe('Closed now · opens tomorrow at 8:30 AM')
  })

  it('skips Friday', () => {
    expect(openStatus(at('2026-10-22', '20:00')).text).toBe('Closed now · opens Saturday at 8:30 AM')
    expect(openStatus(at('2026-10-23', '10:00'))).toEqual({ open: false, text: 'Closed today · opens tomorrow at 8:30 AM' })
  })
})
