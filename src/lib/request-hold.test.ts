import { describe, expect, it } from 'vitest'
import { holdUntil, requestNotice } from './request-hold'

const ist = (date: string, hhmm: string) => `${date}T${hhmm}:00+05:30`
const ms = (iso: string) => new Date(iso).getTime()
// Wednesday 14 Oct 2026; Friday 16 Oct is closed
const WED = '2026-10-14', THU = '2026-10-15', SAT = '2026-10-17'

describe('how long a received request holds its time', () => {
  it('2 hours from when its WhatsApp was received', () => {
    expect(holdUntil(ist(WED, '10:00'), ist(SAT, '11:10'))).toBe(ms(ist(WED, '12:00')))
  })
  it('never past the appointment itself', () => {
    expect(holdUntil(ist(WED, '10:00'), ist(WED, '11:10'))).toBe(ms(ist(WED, '11:10')))
  })
  it('until 10:30 AM on the next open day when 2 hours would run past closing', () => {
    expect(holdUntil(ist(WED, '18:45'), ist(SAT, '11:10'))).toBe(ms(ist(THU, '10:30')))
    // Thursday evening: Friday is closed, so Saturday
    expect(holdUntil(ist(THU, '18:45'), ist('2026-10-18', '11:10'))).toBe(ms(ist(SAT, '10:30')))
  })
  it('until 10:30 AM the same day when received before opening', () => {
    expect(holdUntil(ist(WED, '05:00'), ist(SAT, '11:10'))).toBe(ms(ist(WED, '10:30')))
  })
  it('nothing until received', () => {
    expect(holdUntil(null, ist(SAT, '11:10'))).toBeNull()
  })
})

describe('what a waiting request card says', () => {
  const now = ms(ist(WED, '10:30'))
  const created = ist(WED, '09:50')
  const tomorrow = ist(THU, '10:30')

  it('not held until its WhatsApp is received', () => {
    expect(requestNotice(tomorrow, created, null, now)).toEqual({ text: 'Not held yet: open it from their WhatsApp, or confirm', stale: false })
  })
  it('held, with the time the hold ends', () => {
    expect(requestNotice(tomorrow, created, ist(WED, '10:00'), now)?.text).toMatch(/^Held until 12:00\s?pm$/i)
  })
  it('no longer held once the 2 hours are over', () => {
    expect(requestNotice(tomorrow, created, ist(WED, '08:00'), now)).toEqual({ text: 'No longer held: confirm if still free', stale: false })
  })
  it('"Time passed" (Decline offered) once the asked time has started', () => {
    expect(requestNotice(ist(WED, '10:30'), created, null, now)).toEqual({ text: 'Time passed', stale: true })
  })
  it('a day-old request that was never held offers Decline', () => {
    expect(requestNotice(tomorrow, ist('2026-10-12', '09:00'), null, now)).toEqual({ text: 'No longer held, asked 2 days ago', stale: true })
  })
})
