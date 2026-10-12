import { describe, expect, it } from 'vitest'
import { requestNotice } from './request-hold'

describe('what a waiting request card says', () => {
  const now = new Date('2026-10-14T10:00:00+05:30').getTime()
  const hoursAgo = (h: number) => new Date(now - h * 60 * 60_000).toISOString()
  const tomorrow = '2026-10-15T10:30:00+05:30'

  it('nothing while the time is ahead and the request is under 24 hours old', () => {
    expect(requestNotice(tomorrow, hoursAgo(2), now)).toBeNull()
    expect(requestNotice(tomorrow, hoursAgo(24), now)).toBeNull()
    expect(requestNotice(null, hoursAgo(5), now)).toBeNull()
  })

  it('"Time passed" once the asked time has started, however new the request', () => {
    expect(requestNotice('2026-10-14T09:50:00+05:30', hoursAgo(1), now)).toBe('Time passed')
    expect(requestNotice('2026-10-14T10:00:00+05:30', hoursAgo(1), now)).toBe('Time passed')
    expect(requestNotice('2026-10-13T10:30:00+05:30', hoursAgo(72), now)).toBe('Time passed')
  })

  it('"No longer held" with how long ago it was asked, after 24 hours', () => {
    expect(requestNotice(tomorrow, hoursAgo(25), now)).toBe('No longer held, asked 1 day ago')
    expect(requestNotice(tomorrow, hoursAgo(49), now)).toBe('No longer held, asked 2 days ago')
  })

  it('a request without a time just says how old it is', () => {
    expect(requestNotice(null, hoursAgo(50), now)).toBe('Asked 2 days ago')
  })
})
