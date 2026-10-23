import { describe, expect, it } from 'vitest'
import { ageFromBirthYear, ageOn, birthDateFrom, birthYearFromAge, isBirthday, parseAge, patientAge, titleCaseName } from './patient-fields'

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

  it('uses the date of birth when known, else the birth year, else nothing', () => {
    expect(patientAge({ birth_date: '1990-12-01', birth_year: 1990 }, '2026-10-11')).toBe(35)
    expect(patientAge({ birth_year: 1990 }, '2026-10-11')).toBe(36)
    expect(patientAge({ birth_year: null }, '2026-10-11')).toBeNull()
    expect(patientAge({}, '2026-10-11')).toBeNull()
  })
})

describe('date of birth', () => {
  it('counts a year only once the birthday has come', () => {
    expect(ageOn('1985-03-12', '2026-03-11')).toBe(40)
    expect(ageOn('1985-03-12', '2026-03-12')).toBe(41)
    expect(ageOn('2026-01-05', '2026-10-23')).toBe(0)
  })

  it('reads the day, month and year typed apart', () => {
    expect(birthDateFrom('12', '3', '1985', '2026-10-23')).toBe('1985-03-12')
    expect(birthDateFrom(' 1 ', '01', '2000', '2026-10-23')).toBe('2000-01-01')
    expect(birthDateFrom('31', '2', '1990', '2026-10-23')).toBeNull()
    expect(birthDateFrom('29', '2', '2023', '2026-10-23')).toBeNull()
    expect(birthDateFrom('29', '2', '2024', '2026-10-23')).toBe('2024-02-29')
    expect(birthDateFrom('12', '3', '85', '2026-10-23')).toBeNull()
    expect(birthDateFrom('1', '1', '1899', '2026-10-23')).toBeNull()
    expect(birthDateFrom('24', '10', '2026', '2026-10-23')).toBeNull()
    expect(birthDateFrom('', '3', '1985', '2026-10-23')).toBeNull()
  })

  it('knows a birthday, and keeps 29 February on the 28th in other years', () => {
    expect(isBirthday('1985-10-23', '2026-10-23')).toBe(true)
    expect(isBirthday('1985-10-24', '2026-10-23')).toBe(false)
    expect(isBirthday('2024-02-29', '2027-02-28')).toBe(true)
    expect(isBirthday('2024-02-29', '2028-02-29')).toBe(true)
    expect(isBirthday('2024-02-29', '2028-02-28')).toBe(false)
    expect(isBirthday(null, '2026-10-23')).toBe(false)
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
