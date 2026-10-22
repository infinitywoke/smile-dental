// Today's next patient (the card at the foot of Today): who, and how near or late they are

// The first booked appointment that isn't over yet
export function nextAppointment<T extends { starts_at: string; duration_min: number }>(booked: T[], now: Date): T | null {
  return [...booked]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .find((a) => new Date(a.starts_at).getTime() + a.duration_min * 60_000 > now.getTime()) ?? null
}

// From this many minutes late, Running late and Didn't come are offered more strongly
export const LATE_MINUTES = 5
export const NO_SHOW_MINUTES = 10

// "in 12 min", "in 2 h 5 min", "now", "8 min late"; lateBy is 0 until the time has passed
export function nextTiming(startsAt: string, now: Date): { text: string; lateBy: number } {
  const minutes = Math.round((new Date(startsAt).getTime() - now.getTime()) / 60_000)
  if (minutes < 0) return { text: `${-minutes} min late`, lateBy: -minutes }
  if (minutes === 0) return { text: 'now', lateBy: 0 }
  if (minutes < 60) return { text: `in ${minutes} min`, lateBy: 0 }
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return { text: m === 0 ? `in ${h} h` : `in ${h} h ${m} min`, lateBy: 0 }
}
