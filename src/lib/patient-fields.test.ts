import { describe, expect, it } from 'vitest'
import { ageFromBirthYear, birthYearFromAge, parseAge, patientAge, titleCaseName } from './patient-fields'

describe('age and birth year', () => {
  it('stores this year minus the age', () => {
    expect(birthYearFromAge(40, '2026-10-11')).toBe(1986)
    expect(ageFromBirthYear(1986, '2026-10-11')).toBe(40)
  })

  it('reads a typed age', () => {
    expect(parseAge('35')).toBe(35)
    expect(parseAge(' 7 ')).toBe(7)
    expect(parseAge('')).toBeNull()
    expect(parseAge('abc')).toBeNull()
    expect(parseAge('150')).toBeNull()
    expect(parseAge('-3')).toBeNull()
    expect(parseAge('3.5')).toBeNull()
  })

  it('uses the birth year, else nothing', () => {
    expect(patientAge({ birth_year: 1990 }, '2026-10-11')).toBe(36)
    expect(patientAge({ birth_year: null }, '2026-10-11')).toBeNull()
    expect(patientAge({}, '2026-10-11')).toBeNull()
  })
})

describe('titleCaseName', () => {
  it('puts a capital letter on each word and keeps the rest', () => {
    expect(titleCaseName('prakash shetty')).toBe('Prakash Shetty')
    expect(titleCaseName("  anil   d'souza ")).toBe("Anil D'souza")
    expect(titleCaseName('Asha McDonald')).toBe('Asha McDonald')
    expect(titleCaseName('')).toBe('')
  })
})
