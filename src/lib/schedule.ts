// The clinic's appointment blocks and online-booking rules, all in India time.
// The database enforces the same rules (supabase/patch-booking.sql); this file is
// what the screens use to lay out the day and to explain things to the patient.

const TIME_ZONE = 'Asia/Kolkata'
const IST_OFFSET = '+05:30'

export const BLOCK_MINUTES = 40
// A request must start at least this long after it is made, so Dr. Rahil has time to confirm
export const MIN_LEAD_MINUTES = 120
// Blocks starting at or after this time are booked by phone, not online
export const ONLINE_CUTOFF = '19:00'
// How far ahead the website offers blocks, counting today
export const WINDOW_DAYS = 28

// Block start times, matching the Google Business Profile hours (8:30 AM-1:00 PM, 2:30-7:30 PM).
// A block is offered only if it ends before closing, so the last ones are 11:50 AM and 6:30 PM.
export const MORNING_BLOCKS = ['08:30', '09:10', '09:50', '10:30', '11:10', '11:50']
export const AFTERNOON_BLOCKS = ['14:30', '15:10', '15:50', '16:30', '17:10', '17:50', '18:30']
export const ALL_BLOCKS = [...MORNING_BLOCKS, ...AFTERNOON_BLOCKS]

// "YYYY-MM-DD" + "HH:MM" in India time -> the exact moment, as an ISO string
export function blockInstant(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00${IST_OFFSET}`).toISOString()
}

// The India calendar date and clock time of a moment
export function inIndia(moment: Date | string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(moment))
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  const hour = get('hour') === '24' ? '00' : get('hour')
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` }
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// 0 = Sunday ... 5 = Friday
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export function isClosedDay(date: string): boolean {
  return weekday(date) === 5
}

// The blocks of a day: all 16, or none on a Friday
export function blocksFor(date: string): string[] {
  return isClosedDay(date) ? [] : ALL_BLOCKS
}

// "14:40" -> "2:40 PM"
export function formatBlock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`
}

// The end of a block, "09:50" -> "10:30"
export function blockEnd(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + BLOCK_MINUTES
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function isEveningBlock(hhmm: string): boolean {
  return hhmm >= ONLINE_CUTOFF
}

// Can a visitor request this block online right now? (Does not know about bookings.)
export function isOnlineBookable(date: string, hhmm: string, now: Date): boolean {
  if (!blocksFor(date).includes(hhmm)) return false
  if (isEveningBlock(hhmm)) return false
  const start = new Date(blockInstant(date, hhmm)).getTime()
  if (start < now.getTime() + MIN_LEAD_MINUTES * 60_000) return false
  const today = inIndia(now).date
  return date >= today && date <= addDays(today, WINDOW_DAYS - 1)
}

// What to tell the patient about the confirmation time. At night nobody is reading
// WhatsApp, so promising 15 minutes would be a lie.
export function confirmationPromise(now: Date): string {
  const { time } = inIndia(now)
  if (time >= '21:00' || time < '06:00') return 'Dr. Rahil will confirm your appointment on WhatsApp after 6 AM.'
  return 'Dr. Rahil will confirm your appointment on WhatsApp in under 15 minutes.'
}

// Day and date for headings, "Thu, 15 Oct"
export function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}
