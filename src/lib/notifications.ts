import { dayLabel } from '@/lib/booking-days'
import { formatBlock, formatTimeOf, inIndia } from '@/lib/schedule'

// What Dr. Rahil chose to hear about, and when to keep quiet (the database's notification_settings)
export type NotifySettings = {
  new_request: boolean
  waiting_request: boolean
  morning_brief: boolean
  // Patient names on the lock screen
  show_names: boolean
  // India time, "HH:MM"; quiet hours may run past midnight (21:00 to 08:00)
  quiet_from: string
  quiet_until: string
}

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  new_request: true,
  waiting_request: true,
  morning_brief: true,
  show_names: false,
  quiet_from: '21:00',
  quiet_until: '08:00',
}

// What the database says is due (notify_new_request_all, notify_due_all, for each member)
export type NotifyItem =
  | { kind: 'new_request' | 'waiting_request'; ref: string; name: string; reason: string | null; starts_at: string | null; created_at?: string }
  | { kind: 'morning_brief'; ref: string; booked: number; first_at: string | null; waiting: number; low?: string[] }

export type PushMessage = { title: string; body: string; url: string; tag: string }

export const TEST_MESSAGE: PushMessage = {
  title: 'Notifications are on',
  body: 'New booking requests and the morning brief will show here.',
  url: '/app/notifications',
  tag: 'test',
}

export function inQuietHours(settings: Pick<NotifySettings, 'quiet_from' | 'quiet_until'>, now: Date): boolean {
  const { time } = inIndia(now)
  const { quiet_from: from, quiet_until: until } = settings
  if (from === until) return false
  return from < until ? time >= from && time < until : time >= from || time < until
}

// "Tomorrow, 5:10 PM"
function when(iso: string, now: Date): string {
  const { date, time } = inIndia(iso)
  return `${dayLabel(date, inIndia(now).date)}, ${formatBlock(time)}`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// The words on the phone for one item, or null when he has turned that kind off, or it is quiet hours.
// The morning brief comes at 8:15 whatever the quiet hours, and it counts what came in overnight.
export function messageFor(item: NotifyItem, settings: NotifySettings, now: Date): PushMessage | null {
  if (!settings[item.kind]) return null
  if (item.kind === 'morning_brief') {
    const booked = item.booked > 0 && item.first_at
      ? `${item.booked} booked, first at ${formatTimeOf(item.first_at)}`
      : 'Nothing booked yet'
    const waiting = item.waiting > 0 ? ` · ${plural(item.waiting, 'request', 'requests')} waiting` : ''
    const low = item.low?.length ? ` · Low: ${item.low.join(', ')}` : ''
    return { title: 'Today at the clinic', body: `${booked}${waiting}${low}`, url: '/app', tag: 'morning-brief' }
  }
  if (inQuietHours(settings, now)) return null
  const what = item.reason?.trim() || 'Reason not given'
  const slot = item.starts_at ? `${when(item.starts_at, now)} · ` : ''
  const url = `/app/requests/${item.ref}`
  // The same tag, so the reminder replaces the first notification for that request
  const tag = `request-${item.ref}`
  if (item.kind === 'new_request') {
    return { title: settings.show_names ? `New request: ${item.name}` : 'New booking request', body: `${slot}${what}`, url, tag }
  }
  const minutes = item.created_at ? Math.max(30, Math.round((now.getTime() - new Date(item.created_at).getTime()) / 60_000)) : 30
  return {
    title: settings.show_names ? `${item.name} is still waiting` : 'A request is still waiting',
    body: `${slot}${what}. Came in ${minutes} min ago, not confirmed yet.`,
    url,
    tag,
  }
}
