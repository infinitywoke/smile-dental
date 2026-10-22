import { describe, expect, it } from 'vitest'
import { endOfTodayInIndia, isIndefinite, pauseText } from './booking-pause'

const ist = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`)

describe('pausing online booking', () => {
  it('for the rest of today ends at the next midnight in India, even late in the evening', () => {
    expect(endOfTodayInIndia(ist('2026-10-22', '10:15'))).toBe(new Date('2026-10-23T00:00:00+05:30').toISOString())
    expect(endOfTodayInIndia(ist('2026-10-22', '23:50'))).toBe(new Date('2026-10-23T00:00:00+05:30').toISOString())
  })

  it('says plainly whether the website takes bookings', () => {
    const now = ist('2026-10-22', '10:15')
    expect(pauseText(null, now)).toBe('Taking bookings')
    expect(pauseText('infinity', now)).toBe('Paused until you turn it back on')
    expect(pauseText(endOfTodayInIndia(now), now)).toBe('Paused for the rest of today')
    expect(pauseText(ist('2026-10-23', '17:10').toISOString(), now)).toBe('Paused until tomorrow, 5:10 PM')
    expect(pauseText(ist('2026-10-24', '09:10').toISOString(), now)).toBe('Paused until Sat, 9:10 AM')
    expect(isIndefinite('Infinity')).toBe(true)
  })
})
