import { describe, expect, it } from 'vitest'
import {
  ALL_BLOCKS, addDays, blockEnd, blockInstant, blocksFor, confirmationPromise, formatBlock, inIndia,
  isClosedDay, isOnlineBookable,
} from './schedule'

// Wednesday 14 Oct 2026; Friday is the 16th
const WED = '2026-10-14'
const THU = '2026-10-15'
const FRI = '2026-10-16'
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`)
const openToday = (now: Date, date = WED) => ALL_BLOCKS.filter((b) => isOnlineBookable(date, b, now))

describe('blocks', () => {
  it('has 13 blocks of 40 minutes that all fit inside the opening hours (8:30-1:00, 2:30-7:30)', () => {
    expect(ALL_BLOCKS).toHaveLength(13)
    expect(ALL_BLOCKS[0]).toBe('08:30')
    expect(blockEnd('11:50')).toBe('12:30')
    expect(ALL_BLOCKS[6]).toBe('14:30')
    expect(blockEnd(ALL_BLOCKS.at(-1)!)).toBe('19:10')
    for (const start of ALL_BLOCKS) {
      const end = blockEnd(start)
      expect(end <= '13:00' || (start >= '14:30' && end <= '19:30')).toBe(true)
    }
  })

  it('has no blocks on Fridays', () => {
    expect(isClosedDay(FRI)).toBe(true)
    expect(blocksFor(FRI)).toEqual([])
    expect(blocksFor(THU)).toHaveLength(13)
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
  it('needs at least 2 hours of notice', () => {
    expect(openToday(at(WED, '10:00'))[0]).toBe('14:30')
    expect(openToday(at(WED, '12:30'))[0]).toBe('14:30')
    expect(openToday(at(WED, '12:31'))[0]).toBe('15:10')
  })

  it('leaves one block at 4:30 PM and none after (6:30 PM is the last block)', () => {
    expect(openToday(at(WED, '16:00'))).toEqual(['18:30'])
    expect(openToday(at(WED, '16:30'))).toEqual(['18:30'])
    expect(openToday(at(WED, '16:31'))).toEqual([])
    expect(openToday(at(WED, '17:30'))).toEqual([])
  })

  it('offers tomorrow from 8:30 AM when asked at night', () => {
    const night = at(WED, '23:00')
    expect(openToday(night)).toEqual([])
    expect(openToday(night, THU)[0]).toBe('08:30')
  })

  it('gives the early-morning boundary: 6:00 AM -> 8:30 AM is allowed', () => {
    expect(openToday(at(WED, '06:00'))[0]).toBe('08:30')
    expect(openToday(at(WED, '06:31'))[0]).toBe('09:10')
  })

  it('never offers anything from 7 PM, or outside the opening hours', () => {
    const morning = at(WED, '06:00')
    expect(isOnlineBookable(THU, '19:00', morning)).toBe(false)
    expect(isOnlineBookable(THU, '19:20', morning)).toBe(false)
    expect(isOnlineBookable(THU, '20:00', morning)).toBe(false)
    expect(isOnlineBookable(THU, '18:30', morning)).toBe(true)
    expect(isOnlineBookable(THU, '12:30', morning)).toBe(false)
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
