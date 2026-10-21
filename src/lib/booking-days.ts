import { WINDOW_DAYS, addDays, formatBlock, formatDay, fromMinutes, inIndia, isClosedDay, toMinutes } from './schedule'

// The booking card on the new homepage: the next open days with free times, any other date, and a
// WhatsApp request for a time that isn't on the list. Pure, so it can be tested.

export type OpenDay = { date: string; label: string; short: string; slots: string[] }

// "Today", "Tomorrow" or the weekday
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  return formatDay(date).split(',')[0]
}

// "21 Oct"
export function shortDate(date: string): string {
  return formatDay(date).split(', ')[1]
}

// The first days (in order) that have a free time, with their times
export function daysWithSlots(slots: string[], today: string, count = 6): OpenDay[] {
  const byDay = new Map<string, string[]>()
  for (const slot of slots) {
    const { date } = inIndia(slot)
    if (date < today) continue
    byDay.set(date, [...(byDay.get(date) ?? []), slot])
  }
  return [...byDay.keys()].sort().slice(0, count).map((date) => ({
    date, label: dayLabel(date, today), short: shortDate(date), slots: byDay.get(date)!.sort(),
  }))
}

// The free times of one day
export function slotsOn(slots: string[], date: string): string[] {
  return slots.filter((slot) => inIndia(slot).date === date).sort()
}

export function partOfDay(hhmm: string): 'Morning' | 'Afternoon' | 'Evening' {
  if (hhmm < '13:00') return 'Morning'
  return hhmm < '18:00' ? 'Afternoon' : 'Evening'
}

export type OtherDateCheck =
  | { ok: true; slots: string[] }
  | { ok: false; reason: 'past' | 'closed' | 'beyond' | 'full'; message: string }

// A date picked from the calendar: its free times, or why there are none
export function checkOtherDate(date: string, today: string, slots: string[]): OtherDateCheck {
  if (date < today) return { ok: false, reason: 'past', message: 'Please choose today or a later date.' }
  if (isClosedDay(date)) return { ok: false, reason: 'closed', message: 'The clinic is closed on Fridays. Please choose another date.' }
  if (date > addDays(today, WINDOW_DAYS - 1)) {
    return { ok: false, reason: 'beyond', message: 'Online booking opens four weeks ahead. You can ask for this date on WhatsApp below.' }
  }
  const free = slotsOn(slots, date)
  if (free.length === 0) {
    return { ok: false, reason: 'full', message: 'No online times are free that day. Choose another date, or ask for a time on WhatsApp below.' }
  }
  return { ok: true, slots: free }
}

// The flexible answers to "Preferred time"
export const ANY_TIMES = {
  any: 'any time',
  'any-morning': 'any time in the morning',
  'any-afternoon': 'any time in the afternoon',
  'any-evening': 'any time in the evening',
} as const

// "around 1:30 PM", or "any time in the evening"
export function describePreferred(value: string): string {
  if (value in ANY_TIMES) return ANY_TIMES[value as keyof typeof ANY_TIMES]
  return `around ${formatBlock(value)}`
}

export type TimeGroup = { part: 'Morning' | 'Afternoon' | 'Evening'; times: string[] }

// The clinic's opening hours. A visit can be asked for up to a quarter of an hour before each closing.
const OPEN: [string, string][] = [['08:30', '13:00'], ['14:30', '19:30']]

// Times to ask for when none of the free times suit: every 15 minutes while the clinic is open, none on
// a Friday, and (today) none sooner than half an hour from now
export function preferredTimeOptions(date: string | null, today: string, now: Date): TimeGroup[] {
  if (date && isClosedDay(date)) return []
  const earliest = date === today ? toMinutes(inIndia(now).time) + 30 : 0
  const times: string[] = []
  for (const [from, until] of OPEN) {
    for (let t = toMinutes(from); t <= toMinutes(until) - 15; t += 15) if (t >= earliest) times.push(fromMinutes(t))
  }
  return (['Morning', 'Afternoon', 'Evening'] as const)
    .map((part) => ({ part, times: times.filter((t) => partOfDay(t) === part) }))
    .filter((group) => group.times.length > 0)
}

// Patient -> clinic, for a day or time that isn't on the list. Nothing is saved: the clinic replies.
export function otherTimeMessage(args: { name: string; date: string | null; time: string | null; forWhat: string | null }): string {
  return [
    '*Appointment request (website)*',
    ...(args.name.trim() ? [`Name: ${args.name.trim()}`] : []),
    ...(args.date ? [`Date: ${formatDay(args.date)}`] : []),
    ...(args.time ? [`Preferred time: ${describePreferred(args.time)}`] : []),
    ...(args.forWhat ? [`For: ${args.forWhat}`] : []),
    '',
    'Please let me know if this works.',
  ].join('\n')
}
