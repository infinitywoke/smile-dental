import { addDays, formatBlock, inIndia, isClosedDay, toMinutes } from './schedule'

// The clinic's opening hours, as on its Google Business Profile: 8:30 AM to 1 PM and 2:30 to 7:30 PM,
// every day except Friday
export const OPEN_SESSIONS: [string, string][] = [['08:30', '13:00'], ['14:30', '19:30']]

export type OpenStatus = { open: boolean; text: string }

const weekdayName = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' })

// "Open now · until 1:00 PM", "Closed for lunch · opens at 2:30 PM", "Closed now · opens Saturday at 8:30 AM"
export function openStatus(now: Date): OpenStatus {
  const { date, time } = inIndia(now)
  const t = toMinutes(time)
  if (!isClosedDay(date)) {
    for (const [from, until] of OPEN_SESSIONS) {
      if (t >= toMinutes(from) && t < toMinutes(until)) return { open: true, text: `Open now · until ${formatBlock(until)}` }
    }
    const next = OPEN_SESSIONS.find(([from]) => t < toMinutes(from))
    if (next) {
      return {
        open: false,
        text: next === OPEN_SESSIONS[0] ? `Opens today at ${formatBlock(next[0])}` : `Closed for lunch · opens at ${formatBlock(next[0])}`,
      }
    }
  }
  // Closed for the rest of today: when it opens next
  let day = addDays(date, 1)
  while (isClosedDay(day)) day = addDays(day, 1)
  const when = day === addDays(date, 1) ? 'tomorrow' : weekdayName(day)
  return { open: false, text: `${isClosedDay(date) ? 'Closed today' : 'Closed now'} · opens ${when} at ${formatBlock(OPEN_SESSIONS[0][0])}` }
}
