import { addDays, blockInstant, inIndia, weekday } from '@/lib/schedule'

// A website request holds its time only once its WhatsApp message reached the clinic ("received":
// for now, when Dr. Rahil taps the request link inside the message). From then it is held for 2 hours,
// never past the appointment; a hold that would end after closing (7:30 PM) or before opening (8:30 AM)
// runs to 10:30 AM on the next open day. The same rule as public.request_hold_until in supabase/schema.sql.
const HOUR = 60 * 60_000
const HOLD_HOURS = 2
const STALE_AFTER_HOURS = 24

export function holdUntil(receivedAt: string | null | undefined, requestedStart: string | null): number | null {
  if (!receivedAt || !requestedStart) return null
  let until = new Date(receivedAt).getTime() + HOLD_HOURS * HOUR
  const { date, time } = inIndia(new Date(until))
  if (time > '19:30' || time < '08:30') {
    let day = time > '19:30' ? addDays(date, 1) : date
    while (weekday(day) === 5) day = addDays(day, 1)
    until = new Date(blockInstant(day, '10:30')).getTime()
  }
  return Math.min(until, new Date(requestedStart).getTime())
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

// What the request's card on Today says about its time. "stale" means it is no longer worth waiting on:
// the card then offers Decline right there.
export type RequestNotice = { text: string; stale: boolean }

export function requestNotice(
  requestedStart: string | null,
  createdAt: string,
  receivedAt: string | null | undefined,
  now: number,
): RequestNotice | null {
  if (requestedStart && new Date(requestedStart).getTime() <= now) return { text: 'Time passed', stale: true }
  const age = now - new Date(createdAt).getTime()
  const days = Math.max(1, Math.floor(age / (24 * HOUR)))
  const ago = `asked ${days} day${days === 1 ? '' : 's'} ago`
  if (!requestedStart) return age > STALE_AFTER_HOURS * HOUR ? { text: `No time chosen, ${ago}`, stale: true } : null

  const until = holdUntil(receivedAt, requestedStart)
  if (until !== null && until > now) return { text: `Held until ${clock(until)}`, stale: false }
  if (age > STALE_AFTER_HOURS * HOUR) return { text: `No longer held, ${ago}`, stale: true }
  if (until !== null) return { text: 'No longer held: confirm if still free', stale: false }
  return { text: 'Not held yet: open it from their WhatsApp, or confirm', stale: false }
}
