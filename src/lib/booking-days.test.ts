import { describe, expect, it } from 'vitest'
import { checkOtherDate, dayLabel, daysWithSlots, describePreferred, otherTimeMessage, partOfDay, preferredTimeOptions, slotsOn } from './booking-days'
import { addDays, blockInstant } from './schedule'

// Wednesday 21 October 2026; Friday is the 23rd
const today = '2026-10-21'
const slots = [
  blockInstant('2026-10-22', '10:30'),
  blockInstant('2026-10-21', '15:10'),
  blockInstant('2026-10-21', '09:10'),
  blockInstant('2026-10-24', '11:50'),
  blockInstant('2026-11-02', '16:30'),
]

describe('daysWithSlots', () => {
  it('lists the days with free times in order, each with its times in order', () => {
    const days = daysWithSlots(slots, today)
    expect(days.map((d) => d.date)).toEqual(['2026-10-21', '2026-10-22', '2026-10-24', '2026-11-02'])
    expect(days[0]).toMatchObject({ label: 'Today', short: '21 Oct' })
    expect(days[1].label).toBe('Tomorrow')
    expect(days[2].label).toBe('Sat')
    expect(days[0].slots).toEqual([blockInstant(today, '09:10'), blockInstant(today, '15:10')])
  })

  it('keeps only the first few days', () => {
    expect(daysWithSlots(slots, today, 2).map((d) => d.date)).toEqual(['2026-10-21', '2026-10-22'])
  })
})

describe('checkOtherDate', () => {
  it('gives the free times of a date in the window', () => {
    expect(checkOtherDate('2026-11-02', today, slots)).toEqual({ ok: true, slots: [blockInstant('2026-11-02', '16:30')] })
  })

  it('says why a date has no times', () => {
    expect(checkOtherDate('2026-10-20', today, slots)).toMatchObject({ ok: false, reason: 'past' })
    expect(checkOtherDate('2026-10-23', today, slots)).toMatchObject({ ok: false, reason: 'closed' })
    expect(checkOtherDate(addDays(today, 28), today, slots)).toMatchObject({ ok: false, reason: 'beyond' })
    expect(checkOtherDate('2026-10-25', today, slots)).toMatchObject({ ok: false, reason: 'full' })
  })

  it('keeps the last day of the four-week window bookable', () => {
    const last = addDays(today, 27)
    expect(checkOtherDate(last, today, [blockInstant(last, '10:30')]).ok).toBe(true)
  })
})

describe('the rest', () => {
  it('names the day and the part of the day', () => {
    expect(dayLabel('2026-10-26', today)).toBe('Mon')
    expect(partOfDay('12:30')).toBe('Morning')
    expect(partOfDay('17:50')).toBe('Afternoon')
    expect(partOfDay('18:30')).toBe('Evening')
    expect(slotsOn(slots, '2026-10-24')).toEqual([blockInstant('2026-10-24', '11:50')])
  })

  it('writes the WhatsApp request for another time, leaving out what was not given', () => {
    expect(otherTimeMessage({ name: ' Asha ', date: '2026-11-02', time: '13:30', forWhat: 'Teeth cleaning' })).toBe(
      '*Appointment request (website)*\nName: Asha\nDate: Mon, 2 Nov\nPreferred time: around 1:30 PM\nFor: Teeth cleaning\n\nPlease let me know if this works.',
    )
    expect(otherTimeMessage({ name: '', date: null, time: null, forWhat: null })).toBe(
      '*Appointment request (website)*\n\nPlease let me know if this works.',
    )
    expect(otherTimeMessage({ name: '', date: null, time: 'any-evening', forWhat: null })).toContain('Preferred time: any time in the evening')
  })
})

describe('preferredTimeOptions', () => {
  const at = (hhmm: string) => new Date(blockInstant(today, hhmm))

  it('offers every quarter hour while the clinic is open, in 12-hour words, grouped by part of the day', () => {
    const groups = preferredTimeOptions('2026-10-24', today, at('10:00'))
    expect(groups.map((g) => g.part)).toEqual(['Morning', 'Afternoon', 'Evening'])
    const all = groups.flatMap((g) => g.times)
    expect(all[0]).toBe('08:30')
    expect(all.at(-1)).toBe('19:15')
    expect(all).toContain('12:45')
    expect(all.filter((t) => t > '12:45' && t < '14:30')).toEqual([])
    expect(groups[2].times[0]).toBe('18:00')
    expect(describePreferred('19:15')).toBe('around 7:15 PM')
    expect(describePreferred('any')).toBe('any time')
  })

  it('offers nothing on a Friday, and nothing too soon today', () => {
    expect(preferredTimeOptions('2026-10-23', today, at('10:00'))).toEqual([])
    const later = preferredTimeOptions(today, today, at('16:05')).flatMap((g) => g.times)
    expect(later[0]).toBe('16:45')
    expect(preferredTimeOptions(today, today, at('19:20'))).toEqual([])
  })

  it('without a date, offers the whole day', () => {
    // 8:30 to 12:45 is 18 quarter hours, 2:30 to 7:15 another 20
    expect(preferredTimeOptions(null, today, at('19:20')).flatMap((g) => g.times)).toHaveLength(38)
  })
})
