import { describe, expect, it } from 'vitest'
import { billsFor, byCategory, categoryLabel, dueIn, dueOn, total, whenDue, type Cost, type FixedCost } from './costs'

const bill = (id: string, starts_on: string, every: 'month' | 'year' = 'month', ends_on: string | null = null): FixedCost => ({
  id, name: id, category: 'rent', amount: 15000, every, starts_on, ends_on,
})
const cost = (id: string, spent_on: string, amount: number, category = 'stock', fixed_cost_id: string | null = null): Cost => ({
  id, spent_on, category, amount, paid_by: 'upi', payee: '', note: '', bill_path: null, fixed_cost_id,
})

describe('regular bills', () => {
  it('a monthly bill is due every month from its start until it stops', () => {
    expect(dueIn(bill('rent', '2026-10-05'), '2026-09')).toBe(false)
    expect(dueIn(bill('rent', '2026-10-05'), '2026-10')).toBe(true)
    expect(dueIn(bill('rent', '2026-10-05'), '2027-03')).toBe(true)
    expect(dueIn(bill('rent', '2026-10-05', 'month', '2026-12-31'), '2027-01')).toBe(false)
    expect(dueIn(bill('rent', '2026-10-05', 'month', '2026-12-31'), '2026-12')).toBe(true)
  })

  it('a yearly bill is due only in its own month', () => {
    expect(dueIn(bill('software', '2026-04-01', 'year'), '2027-04')).toBe(true)
    expect(dueIn(bill('software', '2026-04-01', 'year'), '2026-10')).toBe(false)
  })

  it('is due on its day, or the month’s last day when shorter', () => {
    expect(dueOn(bill('rent', '2026-10-31'), '2026-11')).toBe('2026-11-30')
    expect(dueOn(bill('rent', '2026-10-31'), '2027-02')).toBe('2027-02-28')
    expect(dueOn(bill('rent', '2026-10-05'), '2026-12')).toBe('2026-12-05')
  })

  it('lists the month’s bills soonest first, with what was paid for each that month', () => {
    const bills = [bill('electricity', '2026-01-10'), bill('rent', '2026-01-05'), bill('old', '2025-01-01', 'month', '2026-01-31')]
    const paid = cost('c1', '2026-10-06', 15000, 'rent', 'rent')
    const lastMonth = cost('c0', '2026-09-10', 2400, 'electricity', 'electricity')
    const list = billsFor(bills, [paid, lastMonth], '2026-10')
    expect(list.map((b) => [b.name, b.due, b.paid?.id ?? null])).toEqual([['rent', '2026-10-05', 'c1'], ['electricity', '2026-10-10', null]])
  })
})

describe('the month’s costs', () => {
  it('adds up, and groups by kind, biggest first', () => {
    const costs = [cost('a', '2026-10-01', 1200.5), cost('b', '2026-10-02', 15000, 'rent'), cost('c', '2026-10-03', 800.25)]
    expect(total(costs)).toBe(17000.75)
    expect(byCategory(costs)).toEqual([
      { category: 'rent', label: 'Rent', amount: 15000 },
      { category: 'stock', label: 'Supplies', amount: 2000.75 },
    ])
    expect(categoryLabel('salary')).toBe('Other')
  })
})

describe('when a regular bill is due, in words', () => {
  it('says the day of the month, or the date of the year', () => {
    expect(whenDue({ every: 'month', starts_on: '2026-10-05' })).toBe('every month, on the 5th')
    expect(whenDue({ every: 'month', starts_on: '2026-10-01' })).toBe('every month, on the 1st')
    expect(whenDue({ every: 'month', starts_on: '2026-10-12' })).toBe('every month, on the 12th')
    expect(whenDue({ every: 'month', starts_on: '2026-10-22' })).toBe('every month, on the 22nd')
    expect(whenDue({ every: 'year', starts_on: '2026-04-01' })).toBe('every year, on 1 Apr')
  })
})
