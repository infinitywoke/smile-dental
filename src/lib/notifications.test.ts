import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFY_SETTINGS as settings, inQuietHours, messageFor, type NotifyItem } from './notifications'

const ist = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`)
const request: NotifyItem = { kind: 'new_request', ref: 'r1', name: 'Asha Rao', reason: 'Toothache', starts_at: '2026-10-22T11:40:00.000Z' }

describe('quiet hours', () => {
  it('run past midnight, from 9 PM to 8 AM by default', () => {
    expect(inQuietHours(settings, ist('2026-10-21', '20:59'))).toBe(false)
    expect(inQuietHours(settings, ist('2026-10-21', '21:00'))).toBe(true)
    expect(inQuietHours(settings, ist('2026-10-22', '07:59'))).toBe(true)
    expect(inQuietHours(settings, ist('2026-10-22', '08:00'))).toBe(false)
  })

  it('can sit inside one day, or be off', () => {
    expect(inQuietHours({ quiet_from: '13:00', quiet_until: '14:30' }, ist('2026-10-21', '13:30'))).toBe(true)
    expect(inQuietHours({ quiet_from: '13:00', quiet_until: '14:30' }, ist('2026-10-21', '15:00'))).toBe(false)
    expect(inQuietHours({ quiet_from: '00:00', quiet_until: '00:00' }, ist('2026-10-21', '03:00'))).toBe(false)
  })
})

describe('what the phone shows', () => {
  it('a new request: when and what for, with no name on the lock screen unless he wants names', () => {
    expect(messageFor(request, settings, ist('2026-10-21', '16:40'))).toEqual({
      title: 'New booking request', body: 'Tomorrow, 5:10 PM · Toothache', url: '/app/requests/r1', tag: 'request-r1',
    })
    expect(messageFor(request, { ...settings, show_names: true }, ist('2026-10-21', '16:40'))?.title).toBe('New request: Asha Rao')
  })

  it('nothing in quiet hours, or when he turned that kind off', () => {
    expect(messageFor(request, settings, ist('2026-10-21', '22:15'))).toBeNull()
    expect(messageFor(request, { ...settings, new_request: false }, ist('2026-10-21', '16:40'))).toBeNull()
  })

  it('a request still waiting replaces the first notification and says how long', () => {
    const waiting: NotifyItem = { ...request, kind: 'waiting_request', created_at: '2026-10-21T11:00:00.000Z' }
    const message = messageFor(waiting, settings, ist('2026-10-21', '17:05'))
    expect(message).toEqual({
      title: 'A request is still waiting', body: 'Tomorrow, 5:10 PM · Toothache. Came in 35 min ago, not confirmed yet.', url: '/app/requests/r1', tag: 'request-r1',
    })
  })

  it('the morning brief counts the day, and comes whatever the quiet hours', () => {
    const brief: NotifyItem = { kind: 'morning_brief', ref: '2026-10-22', booked: 3, first_at: '2026-10-22T03:00:00.000Z', waiting: 1 }
    expect(messageFor(brief, { ...settings, quiet_until: '09:00' }, ist('2026-10-22', '08:15'))).toEqual({
      title: 'Today at the clinic', body: '3 booked, first at 8:30 AM · 1 request waiting', url: '/app', tag: 'morning-brief',
    })
    expect(messageFor({ ...brief, booked: 0, first_at: null, waiting: 2 }, settings, ist('2026-10-22', '08:15'))?.body).toBe('Nothing booked yet · 2 requests waiting')
  })
})
