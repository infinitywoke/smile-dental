import { todayInIndia } from '@/lib/dates'

// The doctor asks for the date of birth (the database keeps it, and its year as the birth year), or,
// when only the age is known, the age in years (kept as the birth year: this year minus the age).
export const MAX_AGE = 120

export function birthYearFromAge(age: number, today: string = todayInIndia()): number {
  return Number(today.slice(0, 4)) - age
}

export function ageFromBirthYear(birthYear: number, today: string = todayInIndia()): number {
  return Number(today.slice(0, 4)) - birthYear
}

// Reads the typed age: whole years from 0 to 120, or null when empty or not a sensible number
export function parseAge(input: unknown): number | null {
  const text = String(input ?? '').trim()
  if (!/^\d{1,3}$/.test(text)) return null
  const age = Number(text)
  return age <= MAX_AGE ? age : null
}

// Whole years from a date of birth to a day (a birthday later in the year doesn't count yet)
export function ageOn(birthDate: string, today: string = todayInIndia()): number {
  const before = today.slice(5) < birthDate.slice(5)
  return Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (before ? 1 : 0)
}

// The date of birth typed as day, month and year ("12", "3", "1985"): "1985-03-12", or null when it
// isn't a real day from 1900 to today. Any part empty: null.
export function birthDateFrom(day: unknown, month: unknown, year: unknown, today: string = todayInIndia()): string | null {
  const [d, m, y] = [day, month, year].map((part) => String(part ?? '').trim())
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(y)) return null
  const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const real = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(real.getTime()) || real.toISOString().slice(0, 10) !== date) return null
  return date >= '1900-01-01' && date <= today ? date : null
}

// A patient's age in years: from the date of birth when it is known, else from the birth year
export function patientAge(patient: { birth_year?: number | null; birth_date?: string | null }, today: string = todayInIndia()): number | null {
  if (patient.birth_date) return ageOn(patient.birth_date, today)
  if (patient.birth_year) return ageFromBirthYear(patient.birth_year, today)
  return null
}

// Their birthday is today (one born on 29 February has it on 28 February in other years)
export function isBirthday(birthDate: string | null | undefined, today: string = todayInIndia()): boolean {
  if (!birthDate) return false
  const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const day = birthDate.slice(5) === '02-29' && !leap(Number(today.slice(0, 4))) ? '02-28' : birthDate.slice(5)
  return today.slice(5) === day
}

// "prakash  shetty" becomes "Prakash Shetty": a capital letter on each word, the rest as typed
export function titleCaseName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
