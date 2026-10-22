import { describe, expect, it } from 'vitest'
import { HOLIDAYS, holidayKind, holidayName, holidaysBetween, holidaysOn } from './holidays'

// The weekday each official list prints beside its dates (src/lib/holidays.ts names the lists): a date
// copied wrongly lands on another weekday
const SOURCE_WEEKDAYS: Record<string, string> = {
  // Karnataka 2026: general holidays, those on a Sunday or second Saturday, restricted holidays
  '2026-01-15': 'Thu', '2026-01-26': 'Mon', '2026-03-19': 'Thu', '2026-03-21': 'Sat', '2026-03-31': 'Tue',
  '2026-04-03': 'Fri', '2026-04-14': 'Tue', '2026-04-20': 'Mon', '2026-05-01': 'Fri', '2026-05-28': 'Thu',
  '2026-06-26': 'Fri', '2026-08-15': 'Sat', '2026-08-26': 'Wed', '2026-09-14': 'Mon', '2026-10-02': 'Fri',
  '2026-10-20': 'Tue', '2026-10-21': 'Wed', '2026-11-10': 'Tue', '2026-11-27': 'Fri', '2026-12-25': 'Fri',
  '2026-02-15': 'Sun', '2026-10-10': 'Sat', '2026-10-25': 'Sun', '2026-11-01': 'Sun', '2026-11-08': 'Sun',
  '2026-01-01': 'Thu', '2026-01-27': 'Tue', '2026-02-04': 'Wed', '2026-03-02': 'Mon', '2026-03-17': 'Tue',
  '2026-03-20': 'Fri', '2026-03-23': 'Mon', '2026-03-27': 'Fri', '2026-04-04': 'Sat', '2026-04-21': 'Tue',
  '2026-04-22': 'Wed', '2026-08-21': 'Fri', '2026-08-27': 'Thu', '2026-08-28': 'Fri', '2026-09-04': 'Fri',
  '2026-09-08': 'Tue', '2026-09-17': 'Thu', '2026-09-25': 'Fri', '2026-11-24': 'Tue', '2026-11-26': 'Thu',
  '2026-12-24': 'Thu',
  // India 2027 (DoPT): gazetted and restricted holidays; Karnataka's fixed days
  '2027-01-26': 'Tue', '2027-03-10': 'Wed', '2027-03-23': 'Tue', '2027-03-26': 'Fri', '2027-04-15': 'Thu',
  '2027-04-19': 'Mon', '2027-05-17': 'Mon', '2027-05-20': 'Thu', '2027-06-16': 'Wed', '2027-08-15': 'Sun',
  '2027-08-25': 'Wed', '2027-10-02': 'Sat', '2027-10-09': 'Sat', '2027-10-29': 'Fri', '2027-11-14': 'Sun',
  '2027-12-25': 'Sat', '2027-01-01': 'Fri', '2027-01-14': 'Thu', '2027-03-06': 'Sat', '2027-03-28': 'Sun',
  '2027-04-07': 'Wed', '2027-04-14': 'Wed', '2027-08-17': 'Tue', '2027-09-04': 'Sat', '2027-10-08': 'Fri',
  '2027-10-15': 'Fri', '2027-10-28': 'Thu', '2027-10-30': 'Sat', '2027-12-24': 'Fri', '2027-05-01': 'Sat',
  '2027-11-01': 'Mon',
}
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })

describe('the holiday list', () => {
  it('falls on the weekdays the official lists give', () => {
    for (const h of HOLIDAYS) {
      expect(SOURCE_WEEKDAYS[h.date], `${h.date} ${h.name} is in no source`).toBeDefined()
      expect(weekdayOf(h.date), `${h.date} ${h.name}`).toBe(SOURCE_WEEKDAYS[h.date])
    }
  })

  it('is in date order, with no day named twice', () => {
    const dates = HOLIDAYS.map((h) => h.date)
    expect(dates).toEqual([...dates].sort())
    const keys = HOLIDAYS.map((h) => `${h.date} ${h.name}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('names a day, holidays before festivals', () => {
    expect(holidayName('2026-11-10')).toBe('Balipadyami, Deepavali')
    expect(holidayName('2026-04-14')).toBe('Dr. B.R. Ambedkar Jayanthi · Souramana Ugadi (Bisu)')
    expect(holidaysOn('2026-05-01').map((h) => h.kind)).toEqual(['holiday', 'festival'])
    expect(holidayKind('2026-11-24')).toBe('festival')
    expect(holidayName('2026-11-11')).toBeNull()
    expect(holidayKind('2026-11-11')).toBeNull()
  })

  it('gives the days between two dates, both included', () => {
    expect(holidaysBetween('2026-11-01', '2026-11-10').map((h) => h.date)).toEqual(['2026-11-01', '2026-11-08', '2026-11-10'])
  })
})
