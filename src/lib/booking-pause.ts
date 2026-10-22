import { dayLabel } from '@/lib/booking-days'
import { addDays, formatBlock, inIndia } from '@/lib/schedule'

// Online booking can be paused from the Cockpit (supabase/pause-booking-2026-10.sql): for the rest of
// today, or until it is turned back on ("infinity"). While paused the website shows no free times.
export type PauseMode = 'today' | 'indefinite' | 'open'

// When a pause "for the rest of today" ends: the next midnight in India
export const endOfTodayInIndia = (now: Date) => new Date(`${addDays(inIndia(now).date, 1)}T00:00:00+05:30`).toISOString()

export const isIndefinite = (until: string) => /^infinity$/i.test(until)

// What the Cockpit says about the website's booking
export function pauseText(until: string | null, now: Date): string {
  if (!until) return 'Taking bookings'
  if (isIndefinite(until)) return 'Paused until you turn it back on'
  if (new Date(until).getTime() === new Date(endOfTodayInIndia(now)).getTime()) return 'Paused for the rest of today'
  const { date, time } = inIndia(until)
  const day = dayLabel(date, inIndia(now).date)
  return `Paused until ${day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : day}, ${formatBlock(time)}`
}
