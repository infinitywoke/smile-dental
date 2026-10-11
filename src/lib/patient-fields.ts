import { ageOn, todayInIndia } from '@/lib/dates'

// The doctor asks for an age in years; the database keeps the birth year (this year minus the age).
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

// A patient's age in years: from the birth year, or from the date of birth on older records
export function patientAge(
  patient: { birth_year?: number | null; date_of_birth?: string | null },
  today: string = todayInIndia(),
): number | null {
  if (patient.birth_year) return ageFromBirthYear(patient.birth_year, today)
  if (patient.date_of_birth) return ageOn(patient.date_of_birth, today)
  return null
}

// "prakash  shetty" becomes "Prakash Shetty": a capital letter on each word, the rest as typed
export function titleCaseName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
