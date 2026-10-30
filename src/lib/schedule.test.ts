import { describe, expect, it } from 'vitest'
import { ALL_BLOCKS, addDays, blockEnd, blockInstant, blocksFor, confirmationPromise, formatBlock, inIndia, isClosedDay, isOnlineBookable, sameInstant, clinicStartOf, endOf, lengthFrom, lengthLabel, startsFor } from './schedule'

// Wednesday 14 Oct 2026; Friday is the 16th
const WED = '2026-10-14'
const THU = '2026-10-15'
const FRI = '2026-10-16'
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`)
const openToday = (now: Date, date = WED) => ALL_BLOCKS.filter((b) => isOnlineBookable(date, b, now))

describe('blocks', () => {
  it('has 19 half-hour blocks within the opening hours (8:30-1:00, 2:30-7:30), the last of each ending at closing', () => {
    expect(ALL_BLOCKS).toHaveLength(19)
    expect(ALL_BLOCKS[0]).toBe('08:30')
    expect(ALL_BLOCKS[8]).toBe('12:30')
    expect(blockEnd('12:30')).toBe('13:00')
    expect(ALL_BLOCKS[9]).toBe('14:30')
    expect(blockEnd(ALL_BLOCKS.at(-1)!)).toBe('19:30')
    for (const start of ALL_BLOCKS) {
      expect((start >= '08:30' && blockEnd(start) <= '13:00') || (start >= '14:30' && blockEnd(start) <= '19:30')).toBe(true)
    }
  })

  it('has no blocks on Fridays', () => {
    expect(isClosedDay(FRI)).toBe(true)
    expect(blocksFor(FRI)).toEqual([])
    expect(blocksFor(THU)).toHaveLength(19)
  })

  it('formats times for patients', () => {
    expect(formatBlock('08:30')).toBe('8:30 AM')
    expect(formatBlock('12:30')).toBe('12:30 PM')
    expect(formatBlock('14:30')).toBe('2:30 PM')
    expect(formatBlock('18:30')).toBe('6:30 PM')
  })

  it('builds India-time instants', () => {
    expect(blockInstant(WED, '09:10')).toBe('2026-10-14T03:40:00.000Z')
    expect(inIndia('2026-10-14T03:40:00.000Z')).toEqual({ date: WED, time: '09:10' })
    expect(inIndia('2026-10-13T20:00:00.000Z')).toEqual({ date: WED, time: '01:30' })
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })
})

describe('online booking rules', () => {
  it('offers any block that has not started yet (no notice needed)', () => {
    expect(openToday(at(WED, '10:00'))[0]).toBe('10:30')
    expect(openToday(at(WED, '10:29'))[0]).toBe('10:30')
    expect(openToday(at(WED, '10:30'))[0]).toBe('11:00')
    expect(openToday(at(WED, '12:31'))[0]).toBe('14:30')
  })

  it('ends with the 6:30 PM block (evenings are by phone)', () => {
    expect(openToday(at(WED, '16:00'))).toEqual(['16:30', '17:00', '17:30', '18:00', '18:30'])
    expect(openToday(at(WED, '17:30'))).toEqual(['18:00', '18:30'])
    expect(openToday(at(WED, '18:29'))).toEqual(['18:30'])
    expect(openToday(at(WED, '18:30'))).toEqual([])
  })

  it('offers tomorrow from 8:30 AM when asked at night', () => {
    const night = at(WED, '23:00')
    expect(openToday(night)).toEqual([])
    expect(openToday(night, THU)[0]).toBe('08:30')
  })

  it('gives the early-morning boundary: 8:30 AM is offered until it starts', () => {
    expect(openToday(at(WED, '06:00'))[0]).toBe('08:30')
    expect(openToday(at(WED, '08:29'))[0]).toBe('08:30')
    expect(openToday(at(WED, '08:30'))[0]).toBe('09:00')
  })

  it('never offers anything from 7 PM, or outside the opening hours', () => {
    const morning = at(WED, '06:00')
    expect(isOnlineBookable(THU, '19:00', morning)).toBe(false)
    expect(isOnlineBookable(THU, '19:20', morning)).toBe(false)
    expect(isOnlineBookable(THU, '20:00', morning)).toBe(false)
    expect(isOnlineBookable(THU, '18:30', morning)).toBe(true)
    expect(isOnlineBookable(THU, '12:30', morning)).toBe(true)
    expect(isOnlineBookable(THU, '19:10', morning)).toBe(false)
    expect(isOnlineBookable(THU, '13:30', morning)).toBe(false)
  })

  it('never offers Fridays, off-grid times, the past or beyond 28 days', () => {
    const now = at(WED, '10:00')
    expect(isOnlineBookable(FRI, '09:00', now)).toBe(false)
    expect(isOnlineBookable(THU, '09:40', now)).toBe(false)
    expect(isOnlineBookable(THU, '13:30', now)).toBe(false)
    expect(isOnlineBookable('2026-10-13', '14:00', now)).toBe(false)
    expect(isOnlineBookable('2026-11-10', '09:00', now)).toBe(true)
    expect(isOnlineBookable('2026-11-11', '09:00', now)).toBe(false)
  })
})

describe('confirmation promise', () => {
  it('promises 15 minutes in the day and "after 6 AM" at night', () => {
    expect(confirmationPromise(at(WED, '10:00'), 'Dr. Kavya')).toMatch(/under 15 minutes/)
    expect(confirmationPromise(at(WED, '06:00'), 'Dr. Kavya')).toMatch(/under 15 minutes/)
    expect(confirmationPromise(at(WED, '20:59'), 'Dr. Kavya')).toMatch(/under 15 minutes/)
    expect(confirmationPromise(at(WED, '21:00'), 'Dr. Kavya')).toMatch(/after 6 AM/)
    expect(confirmationPromise(at(WED, '03:00'), 'Dr. Kavya')).toMatch(/after 6 AM/)
  })
})

describe('sameInstant', () => {
  it('treats the database and app spellings of one moment as equal', () => {
    expect(sameInstant('2026-10-14T05:00:00+00:00', '2026-10-14T05:00:00.000Z')).toBe(true)
    expect(sameInstant('2026-10-14T10:30:00+05:30', blockInstant('2026-10-14', '10:30'))).toBe(true)
  })
  it('tells different moments, empty values and junk apart', () => {
    expect(sameInstant('2026-10-14T05:00:00.000Z', '2026-10-14T05:40:00.000Z')).toBe(false)
    expect(sameInstant(null, '2026-10-14T05:00:00.000Z')).toBe(false)
    expect(sameInstant('nonsense', 'nonsense')).toBe(false)
  })
})

describe('sameInstant', () => {
  it('treats the database and app spellings of one moment as equal', () => {
    expect(sameInstant('2026-10-14T05:00:00+00:00', '2026-10-14T05:00:00.000Z')).toBe(true)
    expect(sameInstant('2026-10-14T10:30:00+05:30', blockInstant('2026-10-14', '10:30'))).toBe(true)
  })
  it('tells different moments, empty values and junk apart', () => {
    expect(sameInstant('2026-10-14T05:00:00.000Z', '2026-10-14T05:40:00.000Z')).toBe(false)
    expect(sameInstant(null, '2026-10-14T05:00:00.000Z')).toBe(false)
    expect(sameInstant('nonsense', 'nonsense')).toBe(false)
  })
})

describe('appointment lengths', () => {
  it('reads any length in 5-minute steps from 10 minutes to 4 hours from a link, else 30 minutes', () => {
    expect(lengthFrom('45')).toBe(45)
    expect(lengthFrom('80')).toBe(80)
    expect(lengthFrom('240')).toBe(240)
    expect(lengthFrom('47')).toBe(30)
    expect(lengthFrom('5')).toBe(30)
    expect(lengthFrom('245')).toBe(30)
    expect(lengthFrom(undefined)).toBe(30)
    expect(lengthLabel(20)).toBe('20 min')
    expect(lengthLabel(60)).toBe('1 hour')
    expect(lengthLabel(90)).toBe('1 h 30 min')
    expect(lengthLabel(120)).toBe('2 hours')
  })

  it('offers the half-hours where the length fits in a session', () => {
    const thu = '2026-10-15'
    const half = startsFor(thu, 30)
    expect(half[0]).toBe('08:30')
    expect(half).toContain('09:00')
    expect(half).toContain('12:30') // ends at closing, 1:00 PM
    expect(half.at(-1)).toBe('19:00')
    expect(startsFor(thu, 60)).not.toContain('12:30') // would end 1:30 PM, past the morning
    expect(startsFor(thu, 120)).toContain('11:00')
    expect(startsFor(thu, 120)).not.toContain('11:30') // 11:30-1:30 runs into lunch
    expect(startsFor(thu, 120).at(-1)).toBe('17:30')
    expect(startsFor('2026-10-16', 30)).toEqual([]) // Friday
  })

  it('accepts a start on any 5-minute mark where the chosen length fits before closing', () => {
    expect(clinicStartOf('2026-10-15T09:45:00+05:30', 45)?.time).toBe('09:45') // right after a 45-minute 9:00
    expect(clinicStartOf('2026-10-15T12:30:00+05:30', 30)?.time).toBe('12:30')
    expect(clinicStartOf('2026-10-15T12:45:00+05:30', 30)).toBeNull() // would end 1:15 PM
    expect(clinicStartOf('2026-10-15T08:25:00+05:30', 30)).toBeNull() // before opening
    expect(clinicStartOf('2026-10-15T09:47:00+05:30', 30)).toBeNull() // not a 5-minute mark
    expect(clinicStartOf('2026-10-15T08:30:00+05:30', 47)).toBeNull() // not a length
    expect(clinicStartOf('2026-10-16T09:00:00+05:30', 30)).toBeNull() // Friday
    expect(endOf('09:10', 80)).toBe('10:30')
  })
})
