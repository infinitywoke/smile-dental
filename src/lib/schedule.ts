// The clinic's appointment blocks and online-booking rules, all in India time.
// The database enforces the same rules (supabase/schema.sql); this file is
// what the screens use to lay out the day and to explain things to the patient.

const TIME_ZONE = 'Asia/Kolkata'
const IST_OFFSET = '+05:30'

export const BLOCK_MINUTES = 40
// How long before a block starts it can still be requested online. None (owner, 21 Oct 2026): any block
// that hasn't started can be booked; someone coming in sooner can call the clinic.
export const MIN_LEAD_MINUTES = 0
// Blocks starting at or after this time are booked by phone, not online
export const ONLINE_CUTOFF = '19:00'
// How far ahead the website offers blocks, counting today
export const WINDOW_DAYS = 28

// Block start times, matching the Google Business Profile hours (8:30 AM-1:00 PM, 2:30-7:30 PM).
// The last block of each session may run a little past closing (12:30 ends 1:10, 7:10 PM ends 7:50).
export const MORNING_BLOCKS = ['08:30', '09:10', '09:50', '10:30', '11:10', '11:50', '12:30']
export const AFTERNOON_BLOCKS = ['14:30', '15:10', '15:50', '16:30', '17:10', '17:50', '18:30', '19:10']
export const ALL_BLOCKS = [...MORNING_BLOCKS, ...AFTERNOON_BLOCKS]

// Appointment lengths (Dr. Rahil picks one; 40 minutes, one block, unless he chooses otherwise).
// Clinic OS starts appointments on a 20-minute grid within the two sessions; an appointment must end by
// the session's last end (the last 40-minute block of each session already ran a little past closing:
// 12:30-1:10 PM and 7:10-7:50 PM). The website keeps the 40-minute blocks above.
export const SLOT_MINUTES = 20
export const LENGTHS = [20, 40, 60, 80, 120] as const
export type Length = (typeof LENGTHS)[number]
export const DEFAULT_LENGTH: Length = 40
const SESSIONS: [string, string][] = [['08:30', '13:10'], ['14:30', '19:50']]

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
export const fromMinutes = (total: number) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

export function isLength(value: unknown): value is Length {
  return LENGTHS.includes(Number(value) as Length)
}

// A length from a link or form ("80"), or the default
export function lengthFrom(value: unknown): Length {
  return isLength(value) ? (Number(value) as Length) : DEFAULT_LENGTH
}

// "20 min", "40 min", "1 hour", "1 h 20 min", "2 hours"
export function lengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} hour${h === 1 ? '' : 's'}` : `${h} h ${m} min`
}

// Every start on the 20-minute grid where an appointment of this length fits (none on a Friday)
export function startsFor(date: string, length: number): string[] {
  if (isClosedDay(date)) return []
  return SESSIONS.flatMap(([from, until]) => {
    const starts: string[] = []
    for (let t = toMinutes(from); t + length <= toMinutes(until); t += SLOT_MINUTES) starts.push(fromMinutes(t))
    return starts
  })
}

// A start where an appointment of this length may begin (Clinic OS), else null
export function clinicStartOf(startsAt: string, length: number): { iso: string; date: string; time: string } | null {
  const d = new Date(startsAt)
  if (Number.isNaN(d.getTime()) || !isLength(length)) return null
  const { date, time } = inIndia(d)
  if (!startsFor(date, length).includes(time)) return null
  return { iso: d.toISOString(), date, time }
}

// "09:10" + 60 -> "10:10"
export function endOf(hhmm: string, minutes: number): string {
  return fromMinutes(toMinutes(hhmm) + minutes)
}

// "YYYY-MM-DD" + "HH:MM" in India time -> the exact moment, as an ISO string
export function blockInstant(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00${IST_OFFSET}`).toISOString()
}

// Do two spellings of a moment ("...+00:00" from the database, "....000Z" from the app) mean the same instant?
export function sameInstant(a: string | Date | null | undefined, b: string | Date | null | undefined): boolean {
  if (a == null || b == null) return false
  const x = new Date(a).getTime()
  const y = new Date(b).getTime()
  return !Number.isNaN(x) && x === y
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

// A start that is exactly one of the clinic's blocks (and not on a Friday), else null
export function clinicBlockOf(startsAt: string): { iso: string; date: string; time: string } | null {
  const d = new Date(startsAt)
  if (Number.isNaN(d.getTime())) return null
  const { date, time } = inIndia(d)
  if (isClosedDay(date) || !ALL_BLOCKS.includes(time)) return null
  return { iso: d.toISOString(), date, time }
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

// The blocks of a day: all 15, or none on a Friday
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
  if (start <= now.getTime() + MIN_LEAD_MINUTES * 60_000) return false
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
