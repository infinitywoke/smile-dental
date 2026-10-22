// The clinic's appointment blocks and online-booking rules, all in India time.
// The database enforces the same rules (supabase/schema.sql); this file is
// what the screens use to lay out the day and to explain things to the patient.

const TIME_ZONE = 'Asia/Kolkata'
const IST_OFFSET = '+05:30'

export const BLOCK_MINUTES = 30
// How long before a block starts it can still be requested online. None (owner, 21 Oct 2026): any block
// that hasn't started can be booked; someone coming in sooner can call the clinic.
export const MIN_LEAD_MINUTES = 0
// Blocks starting at or after this time are booked by phone, not online
export const ONLINE_CUTOFF = '19:00'
// How far ahead the website offers blocks, counting today
export const WINDOW_DAYS = 28

// Block start times, every 30 minutes within the Google Business Profile hours (8:30 AM-1:00 PM,
// 2:30-7:30 PM): the last block of each session ends at closing (12:30 ends 1:00, 7:00 PM ends 7:30).
export const MORNING_BLOCKS = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30']
export const AFTERNOON_BLOCKS = ['14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00']
export const ALL_BLOCKS = [...MORNING_BLOCKS, ...AFTERNOON_BLOCKS]

// Appointment lengths: Dr. Rahil chooses any length from 10 minutes to 4 hours in 5-minute steps (30
// minutes, one block, unless he chooses otherwise); the quick picks are the common ones. Clinic OS offers
// the 30-minute grid within the two sessions, and the moment something ends (so a 45-minute appointment
// at 9:00 leaves 9:45 free); an appointment may start on any 5-minute mark and must end by closing
// (1:00 PM, 7:30 PM). The database enforces the same rule (is_clinic_start in supabase/schema.sql).
export const SLOT_MINUTES = 30
export const LENGTH_STEP = 5
export const MIN_LENGTH = 10
export const MAX_LENGTH = 240
export const QUICK_LENGTHS = [30, 60, 90, 120] as const
export const DEFAULT_LENGTH = 30
const SESSIONS: [string, string][] = [['08:30', '13:00'], ['14:30', '19:30']]

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
export const fromMinutes = (total: number) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

export function isLength(value: unknown): value is number {
  const n = Number(value)
  return Number.isInteger(n) && n % LENGTH_STEP === 0 && n >= MIN_LENGTH && n <= MAX_LENGTH
}

// A length from a link or form ("45"), or the default
export function lengthFrom(value: unknown): number {
  return isLength(value) ? Number(value) : DEFAULT_LENGTH
}

// Whether an appointment of this length may start at this time (Clinic OS): a 5-minute mark of a
// session, ending by closing, not on a Friday
export function isClinicStart(date: string, time: string, length: number): boolean {
  if (isClosedDay(date) || !isLength(length)) return false
  const t = toMinutes(time)
  return t % LENGTH_STEP === 0 && SESSIONS.some(([from, until]) => t >= toMinutes(from) && t + length <= toMinutes(until))
}

// "30 min", "1 hour", "1 h 30 min", "2 hours"
export function lengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} hour${h === 1 ? '' : 's'}` : `${h} h ${m} min`
}

// Every start on the 30-minute grid where an appointment of this length fits (none on a Friday)
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
  if (Number.isNaN(d.getTime()) || d.getUTCSeconds() !== 0 || d.getUTCMilliseconds() !== 0) return null
  const { date, time } = inIndia(d)
  if (!isClinicStart(date, time, length)) return null
  return { iso: d.toISOString(), date, time }
}

// "09:30" + 60 -> "10:30"
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

// The blocks of a day: all 19, or none on a Friday
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

// The end of a block, "09:30" -> "10:00"
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

// A moment's India clock time, "2:40 PM"
export function formatTimeOf(moment: Date | string): string {
  return formatBlock(inIndia(moment).time)
}

// A moment's India day and time, "Thu, 15 Oct, 2:40 PM"
export function formatWhen(moment: Date | string): string {
  const { date, time } = inIndia(moment)
  return `${formatDay(date)}, ${formatBlock(time)}`
}
