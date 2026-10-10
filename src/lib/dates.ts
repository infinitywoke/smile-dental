// The clinic runs on India time, whatever timezone the server is in.
const TIME_ZONE = 'Asia/Kolkata'

// Today's date in India as YYYY-MM-DD
export function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date())
}

// "15 Oct 2026" from a YYYY-MM-DD date
export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { ...options, timeZone: 'UTC' })
}

// Age in whole years on a given day (defaults to today in India)
export function ageOn(dateOfBirth: string, onDate: string = todayInIndia()): number {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number)
  const [y, m, d] = onDate.split('-').map(Number)
  let age = y - by
  if (m < bm || (m === bm && d < bd)) age--
  return age
}
