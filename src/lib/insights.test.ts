import { describe, expect, it } from 'vitest'
import { monthPeriods, nextMonth, previousMonth, summarise, type InsightRows } from './insights'

describe('this month\'s numbers', () => {
  it('compares a running month with the same days of last month, and a past month with the whole month before', () => {
    expect(monthPeriods(null, '2026-10-20')).toEqual({ month: '2026-10', running: true, current: { from: '2026-10-01', to: '2026-10-20' }, previous: { from: '2026-09-01', to: '2026-09-20' } })
    expect(monthPeriods('2026-09', '2026-10-20')).toEqual({ month: '2026-09', running: false, current: { from: '2026-09-01', to: '2026-09-30' }, previous: { from: '2026-08-01', to: '2026-08-31' } })
    // 31 March is compared with the last day of February
    expect(monthPeriods(null, '2026-03-31').previous).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    // A month still to come, or nonsense, means this month
    expect(monthPeriods('2026-12', '2026-10-20').month).toBe('2026-10')
    expect(monthPeriods('soon', '2026-10-20').month).toBe('2026-10')
    expect(previousMonth('2026-01')).toBe('2025-12')
    expect(nextMonth('2026-12')).toBe('2027-01')
  })

  it('adds up money, visits, new patients and where they came from, bookings, missed visits and treatments', () => {
    const periods = monthPeriods(null, '2026-10-20')
    const rows: InsightRows = {
      payments: [
        { date: '2026-10-02', amount: 500, method: 'cash' },
        { date: '2026-10-19', amount: 3500, method: 'upi' },
        { date: '2026-09-10', amount: 1200, method: 'cash' },
        // after the same day last month: not compared
        { date: '2026-09-25', amount: 9999, method: 'cash' },
      ],
      visits: [
        { date: '2026-10-02', patientId: 'a' },
        { date: '2026-10-09', patientId: 'a' },
        { date: '2026-10-19', patientId: 'b' },
        { date: '2026-09-05', patientId: 'c' },
      ],
      newPatients: [
        { date: '2026-10-02', heardFrom: 'Google' },
        { date: '2026-10-19', heardFrom: 'Google' },
        { date: '2026-10-19', heardFrom: null },
        { date: '2026-09-05', heardFrom: 'Friend' },
      ],
      requests: [
        { date: '2026-10-03', status: 'booked' },
        { date: '2026-10-04', status: 'declined' },
        { date: '2026-10-05', status: 'new' },
      ],
      appointments: [
        { date: '2026-10-02', status: 'done', seen: true },
        { date: '2026-10-09', status: 'booked', seen: true },
        { date: '2026-10-10', status: 'no_show', seen: false },
        // not happened yet, or never marked: no outcome, not counted
        { date: '2026-10-20', status: 'booked', seen: false },
        { date: '2026-09-12', status: 'no_show', seen: false },
      ],
      charges: [
        { date: '2026-10-02', amount: 600, slug: 'scaling-teeth-cleaning' },
        { date: '2026-10-19', amount: 3500, slug: 'root-canal-treatment' },
        { date: '2026-10-19', amount: 300, slug: null },
        { date: '2026-10-09', amount: 400, slug: 'scaling-teeth-cleaning' },
      ],
    }
    const s = summarise(rows, periods, { 'scaling-teeth-cleaning': 'Scaling', 'root-canal-treatment': 'Root Canal Treatment' })
    expect(s.money).toEqual({ total: 4000, cash: 500, upi: 3500, count: 2, before: 1200 })
    expect(s.visits).toEqual({ count: 3, patients: 2, before: 1 })
    expect(s.newPatients).toEqual({ count: 3, before: 1, sources: [{ label: 'Google', count: 2 }, { label: 'Not asked', count: 1 }] })
    expect(s.website).toEqual({ requests: 3, booked: 1, before: 0 })
    expect(s.missed).toEqual({ didntCome: 1, outOf: 3, before: 1 })
    expect(s.treatments).toEqual([
      { name: 'Root Canal Treatment', amount: 3500, count: 1 },
      { name: 'Scaling', amount: 1000, count: 2 },
      { name: 'Other charges', amount: 300, count: 1 },
    ])
  })
})
