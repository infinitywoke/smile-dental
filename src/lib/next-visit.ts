import { addDays, isClosedDay } from '@/lib/schedule'

// The "next visit" day: by default the same weekday one week later; or after another gap. The next open
// day if that is a Friday.
export function suggestedDate(visitDate: string, days = 7): string {
  let date = addDays(visitDate, days)
  while (isClosedDay(date)) date = addDays(date, 1)
  return date
}

// Prefer the time of today's appointment when it is free that day, else the first free time
export function pickSuggestedTime(preferred: string | null, freeTimes: string[]): string | null {
  if (freeTimes.length === 0) return null
  return preferred && freeTimes.includes(preferred) ? preferred : freeTimes[0]
}
