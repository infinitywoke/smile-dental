import { describe, expect, it } from 'vitest'
import { countDifference, expiresSoon, isLow, materialsCost, moveLine, parseQty, pluralUnit, qtyWithUnit, sortStock, stockAlerts, type StockLevel } from './stock'

const level = (name: string, on_hand: number, low_level = 0, next_expiry: string | null = null): StockLevel => ({
  item_id: name, name, category: 'material', unit: 'capsule', low_level, supplier: '', last_unit_cost: null, on_hand, next_expiry,
})
const today = '2026-10-22'

describe('low and expiring', () => {
  it('is low at or below its level, and never when the level is 0', () => {
    expect(isLow(level('a', 3, 3))).toBe(true)
    expect(isLow(level('a', 4, 3))).toBe(false)
    expect(isLow(level('a', 0, 0))).toBe(false)
    expect(isLow(level('a', -2, 1))).toBe(true)
  })

  it('expires soon within 30 days', () => {
    expect(expiresSoon('2026-11-21', today)).toBe(true)
    expect(expiresSoon('2026-11-22', today)).toBe(false)
    expect(expiresSoon(null, today)).toBe(false)
  })

  it('lists low first, then expiring, then by name; and counts both for the Cockpit', () => {
    const levels = [level('Gloves', 9, 2), level('Bond', 5, 0, '2026-11-01'), level('Alginate', 4, 0), level('Composite', 1, 3)]
    expect(sortStock(levels, today).map((s) => s.name)).toEqual(['Composite', 'Bond', 'Alginate', 'Gloves'])
    expect(stockAlerts(levels, today)).toEqual({ low: 1, expiring: 1 })
  })
})

describe('amounts in words', () => {
  it('says the unit as he would', () => {
    expect(qtyWithUnit(1, 'box')).toBe('1 box')
    expect(qtyWithUnit(3, 'box')).toBe('3 boxes')
    expect(qtyWithUnit(2.5, 'ml')).toBe('2.5 ml')
    expect(qtyWithUnit(0, 'capsule')).toBe('0 capsules')
    expect(qtyWithUnit(12.0, 'piece')).toBe('12 pieces')
    expect(pluralUnit('battery')).toBe('batteries')
    expect(pluralUnit('gloves')).toBe('gloves')
    expect(pluralUnit('pouch')).toBe('pouches')
  })

  it('reads what he typed: up to two decimals, above 0 unless counting', () => {
    expect(parseQty('10')).toBe(10)
    expect(parseQty(' 2,5 ')).toBe(2.5)
    expect(parseQty('0')).toBeNull()
    expect(parseQty('0', { allowZero: true })).toBe(0)
    expect(parseQty('1.234')).toBeNull()
    expect(parseQty('-3')).toBeNull()
    expect(parseQty('ten')).toBeNull()
  })

  it('a count moves only the difference', () => {
    expect(countDifference(10, 8)).toBe(-2)
    expect(countDifference(2.2, 2.3)).toBe(0.1)
    expect(countDifference(5, 5)).toBe(0)
  })

  it('tells each move in plain words', () => {
    const move = { unit_cost: null, expires_on: null, note: '', charge_id: null }
    expect(moveLine({ ...move, kind: 'in', qty: 10, unit_cost: 120, expires_on: '2027-06-30' }, 'capsule'))
      .toBe('Added 10 capsules at ₹120 each, expires 30 Jun 2027')
    expect(moveLine({ ...move, kind: 'use', qty: -1, note: 'Fillings – 3M Z350 Composite', charge_id: 'c1' }, 'capsule'))
      .toBe('Used 1 capsule for Fillings – 3M Z350 Composite')
    expect(moveLine({ ...move, kind: 'use', qty: -2 }, 'box')).toBe('Used 2 boxes')
    expect(moveLine({ ...move, kind: 'waste', qty: -1 }, 'box')).toBe('Thrown away 1 box')
    expect(moveLine({ ...move, kind: 'count', qty: -2 }, 'box')).toBe('Counted: 2 boxes fewer than the app had')
  })
})

describe('what a treatment’s materials cost', () => {
  it('adds each item at its last price, and says when a price is missing', () => {
    const composite = { ...level('Composite', 10), last_unit_cost: 120 }
    const bond = { ...level('Bond', 5), last_unit_cost: 40 }
    const gloves = level('Gloves', 50)
    expect(materialsCost([{ item_id: 'Composite', qty: 1 }, { item_id: 'Bond', qty: 0.5 }], [composite, bond])).toEqual({ amount: 140, complete: true })
    expect(materialsCost([{ item_id: 'Composite', qty: 1 }, { item_id: 'Gloves', qty: 2 }], [composite, gloves])).toEqual({ amount: 120, complete: false })
    expect(materialsCost([], [composite])).toEqual({ amount: 0, complete: true })
  })
})
