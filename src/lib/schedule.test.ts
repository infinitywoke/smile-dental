import { describe, expect, it } from 'vitest'
import { ALL_BLOCKS, addDays, blockEnd, blockInstant, blocksFor, confirmationPromise, formatBlock, inIndia, isClosedDay, isOnlineBookable, sameInstant, clinicStartOf, endOf, lengthFrom, lengthLabel, startsFor } from './schedule'

// Wednesday 14 Oct 2026; Friday is the 16th
const WED = '2026-10-14'
const THU = '2026-10-15'
const FRI = '2026-10-16'
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`)
const openToday = (now: Date, date = WED) => ALL_BLOCKS.filter((b) => isOnlineBookable(date, b, now))

describe('blocks', () => {
  it('has 15 blocks of 40 minutes that follow the opening hours (8:30-1:00, 2:30-7:30)', () => {
    expect(ALL_BLOCKS).toHaveLength(15)
    expect(ALL_BLOCKS[0]).toBe('08:30')
    expect(ALL_BLOCKS[6]).toBe('12:30')
    expect(blockEnd('12:30')).toBe('13:10')
    expect(ALL_BLOCKS[7]).toBe('14:30')
    expect(blockEnd(ALL_BLOCKS.at(-1)!)).toBe('19:50')
    // Every block starts inside opening hours; only the last of each session overruns
    for (const start of ALL_BLOCKS) {
      expect((start >= '08:30' && start < '13:00') || (start >= '14:30' && start < '19:30')).toBe(true)
    }
  })

  it('has no blocks on Fridays', () => {
    expect(isClosedDay(FRI)).toBe(true)
    expect(blocksFor(FRI)).toEqual([])
    expect(blocksFor(THU)).toHaveLength(15)
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
    expect(openToday(at(WED, '10:30'))[0]).toBe('11:10')
    expect(openToday(at(WED, '12:31'))[0]).toBe('14:30')
  })

  it('ends with the 6:30 PM block (evenings are by phone)', () => {
    expect(openToday(at(WED, '16:00'))).toEqual(['16:30', '17:10', '17:50', '18:30'])
    expect(openToday(at(WED, '17:30'))).toEqual(['17:50', '18:30'])
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
    expect(openToday(at(WED, '08:30'))[0]).toBe('09:10')
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
    expect(isOnlineBookable(FRI, '09:10', now)).toBe(false)
    expect(isOnlineBookable(THU, '09:30', now)).toBe(false)
    expect(isOnlineBookable(THU, '13:30', now)).toBe(false)
    expect(isOnlineBookable('2026-10-13', '14:00', now)).toBe(false)
    expect(isOnlineBookable('2026-11-10', '09:10', now)).toBe(true)
    expect(isOnlineBookable('2026-11-11', '09:10', now)).toBe(false)
  })
})

describe('confirmation promise', () => {
  it('promises 15 minutes in the day and "after 6 AM" at night', () => {
    expect(confirmationPromise(at(WED, '10:00'))).toMatch(/under 15 minutes/)
    expect(confirmationPromise(at(WED, '06:00'))).toMatch(/under 15 minutes/)
    expect(confirmationPromise(at(WED, '20:59'))).toMatch(/under 15 minutes/)
    expect(confirmationPromise(at(WED, '21:00'))).toMatch(/after 6 AM/)
    expect(confirmationPromise(at(WED, '03:00'))).toMatch(/after 6 AM/)
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
  it('reads a length from a link, falling back to 40 minutes', () => {
    expect(lengthFrom('80')).toBe(80)
    expect(lengthFrom('45')).toBe(40)
    expect(lengthFrom(undefined)).toBe(40)
    expect(lengthLabel(20)).toBe('20 min')
    expect(lengthLabel(60)).toBe('1 hour')
    expect(lengthLabel(80)).toBe('1 h 20 min')
    expect(lengthLabel(120)).toBe('2 hours')
  })

  it('starts every 20 minutes where the length fits in a session', () => {
    const thu = '2026-10-15'
    const forty = startsFor(thu, 40)
    expect(forty[0]).toBe('08:30')
    expect(forty).toContain('08:50')
    expect(forty).toContain('12:30')
    expect(forty).not.toContain('12:50') // would end 1:30 PM, past the morning
    expect(forty.at(-1)).toBe('19:10')
    expect(startsFor(thu, 20)).toContain('12:50')
    expect(startsFor(thu, 120)).not.toContain('11:30') // 11:30-1:30 runs into lunch
    expect(startsFor(thu, 120).at(-1)).toBe('17:50')
    expect(startsFor('2026-10-16', 40)).toEqual([]) // Friday
  })

  it('accepts only a start where the chosen length fits', () => {
    expect(clinicStartOf('2026-10-15T08:50:00+05:30', 40)?.time).toBe('08:50')
    expect(clinicStartOf('2026-10-15T12:50:00+05:30', 40)).toBeNull()
    expect(clinicStartOf('2026-10-15T08:40:00+05:30', 20)).toBeNull()
    expect(clinicStartOf('2026-10-15T08:30:00+05:30', 45)).toBeNull()
    expect(endOf('09:10', 80)).toBe('10:30')
  })
})
