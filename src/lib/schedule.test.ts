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
  it('has 16 blocks of 40 minutes with a break from 12:30 to 2:00 PM', () => {
    expect(ALL_BLOCKS).toHaveLength(16)
    expect(ALL_BLOCKS[0]).toBe('08:30')
    expect(blockEnd('11:50')).toBe('12:30')
    expect(ALL_BLOCKS[6]).toBe('14:00')
    expect(blockEnd(ALL_BLOCKS.at(-1)!)).toBe('20:40')
  })

  it('has no blocks on Fridays', () => {
    expect(isClosedDay(FRI)).toBe(true)
    expect(blocksFor(FRI)).toEqual([])
    expect(blocksFor(THU)).toHaveLength(16)
  })

  it('formats times for patients', () => {
    expect(formatBlock('08:30')).toBe('8:30 AM')
    expect(formatBlock('12:30')).toBe('12:30 PM')
    expect(formatBlock('14:40')).toBe('2:40 PM')
    expect(formatBlock('20:00')).toBe('8:00 PM')
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
    expect(openToday(at(WED, '10:00'))[0]).toBe('14:00')
    expect(openToday(at(WED, '12:00'))[0]).toBe('14:00')
    expect(openToday(at(WED, '12:01'))[0]).toBe('14:40')
  })

  it('leaves one block at 4:30 PM and none after 4:40 PM (6:40 PM is the last online block)', () => {
    expect(openToday(at(WED, '16:30'))).toEqual(['18:40'])
    expect(openToday(at(WED, '16:40'))).toEqual(['18:40'])
    expect(openToday(at(WED, '16:41'))).toEqual([])
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

  it('never offers 7:20 PM or 8:00 PM online', () => {
    const morning = at(WED, '06:00')
    expect(isOnlineBookable(THU, '19:20', morning)).toBe(false)
    expect(isOnlineBookable(THU, '20:00', morning)).toBe(false)
    expect(isOnlineBookable(THU, '18:40', morning)).toBe(true)
  })

  it('never offers Fridays, off-grid times, the past or beyond 28 days', () => {
    const now = at(WED, '10:00')
    expect(isOnlineBookable(FRI, '09:10', now)).toBe(false)
    expect(isOnlineBookable(THU, '09:30', now)).toBe(false)
    expect(isOnlineBookable(THU, '13:00', now)).toBe(false)
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
