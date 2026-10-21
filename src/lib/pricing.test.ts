import { describe, expect, it } from 'vitest'
import { treatments } from '@/config/site'
import { formatPrice, formatRupees, parsePrice, priceForPatients, priceListOptions, type Price } from './pricing'

// Expected parse for every cost string in the real price list. A new or changed string in
// src/config/site.ts fails the "every cost string" test until it is added here.
const expected: Record<string, Price> = {
  '200/-': { kind: 'fixed', amount: 200 },
  '300/-': { kind: 'fixed', amount: 300 },
  '350/-': { kind: 'fixed', amount: 350 },
  '400/-': { kind: 'fixed', amount: 400 },
  '500/-': { kind: 'fixed', amount: 500 },
  '600/-': { kind: 'fixed', amount: 600 },
  '700/-': { kind: 'fixed', amount: 700 },
  '800/-': { kind: 'fixed', amount: 800 },
  '900/-': { kind: 'fixed', amount: 900 },
  '1,200/-': { kind: 'fixed', amount: 1200 },
  '3,500/-': { kind: 'fixed', amount: 3500 },
  '7,000/-': { kind: 'fixed', amount: 7000 },
  '9,000/-': { kind: 'fixed', amount: 9000 },
  '14,000/-': { kind: 'fixed', amount: 14000 },
  '25,000/-': { kind: 'fixed', amount: 25000 },
  '30,000/-': { kind: 'fixed', amount: 30000 },
  '45,000/-': { kind: 'fixed', amount: 45000 },
  '1,25,000/-': { kind: 'fixed', amount: 125000 },
  '45,000/- to 65,000/-': { kind: 'range', min: 45000, max: 65000 },
  '1,200/- + 400/-* number of additional teeth.': {
    kind: 'formula',
    base: 1200,
    perUnit: 400,
    text: '1,200/- + 400/-* number of additional teeth.',
  },
  '3,499/- (Per Crown)': { kind: 'fixed', amount: 3499, note: 'Per Crown' },
  '3,999/- (Per Crown)': { kind: 'fixed', amount: 3999, note: 'Per Crown' },
  '4,999/- (Per Crown)': { kind: 'fixed', amount: 4999, note: 'Per Crown' },
  '6,499/- (Per Crown)': { kind: 'fixed', amount: 6499, note: 'Per Crown' },
  '7,499/- (Per Crown)': { kind: 'fixed', amount: 7499, note: 'Per Crown' },
  '9,999/- (Per Crown)': { kind: 'fixed', amount: 9999, note: 'Per Crown' },
}

const allCosts = treatments.flatMap((t) => (t.pricing ?? []).map((p) => p.cost))

describe('parsePrice on the real price list', () => {
  it('has cost strings to check', () => {
    expect(allCosts.length).toBeGreaterThan(30)
  })

  it.each(allCosts)('parses %j', (cost) => {
    expect(expected, `add ${JSON.stringify(cost)} to the expected table`).toHaveProperty([cost])
    expect(parsePrice(cost)).toEqual(expected[cost])
  })

  it('reads nothing as unknown and never produces a huge number', () => {
    for (const cost of allCosts) {
      const price = parsePrice(cost)
      expect(price.kind).not.toBe('unknown')
      const numbers =
        price.kind === 'fixed' ? [price.amount]
        : price.kind === 'range' ? [price.min, price.max]
        : price.kind === 'formula' ? [price.base, price.perUnit]
        : []
      for (const n of numbers) expect(n).toBeLessThanOrEqual(200000)
    }
  })
})

describe('parsePrice spot checks', () => {
  it('aligners stay a range (old bug made this 4500065000)', () => {
    expect(parsePrice('45,000/- to 65,000/-')).toEqual({ kind: 'range', min: 45000, max: 65000 })
  })

  it('Indian digit grouping', () => {
    expect(parsePrice('1,25,000/-')).toEqual({ kind: 'fixed', amount: 125000 })
    expect(parsePrice('12,34,567/-')).toEqual({ kind: 'fixed', amount: 1234567 })
    expect(parsePrice('125,000')).toEqual({ kind: 'fixed', amount: 125000 })
  })

  it('crowns keep their note', () => {
    expect(parsePrice('3,499/- (Per Crown)')).toEqual({ kind: 'fixed', amount: 3499, note: 'Per Crown' })
  })

  it('partial denture formula', () => {
    expect(parsePrice('1,200/- + 400/-* number of additional teeth.')).toMatchObject({
      kind: 'formula',
      base: 1200,
      perUnit: 400,
    })
  })

  it('accepts ₹/Rs prefixes and dash separators', () => {
    expect(parsePrice('₹3,500')).toEqual({ kind: 'fixed', amount: 3500 })
    expect(parsePrice('Rs. 500/-')).toEqual({ kind: 'fixed', amount: 500 })
    expect(parsePrice('3,499 – 9,999')).toEqual({ kind: 'range', min: 3499, max: 9999 })
    expect(parsePrice('3,499/- - 9,999/-')).toEqual({ kind: 'range', min: 3499, max: 9999 })
  })

  it('anything unreadable is unknown, never digit-stripped', () => {
    for (const cost of ['', 'On consultation', 'Free', '1,2345/-', '45,000/- to 65,000/- or more', '65,000/- to 45,000/-', '3,500/- 4,000/-']) {
      expect(parsePrice(cost)).toEqual({ kind: 'unknown', text: cost.trim() })
    }
  })
})

describe('priceListOptions', () => {
  it('flattens every priced line with its treatment', () => {
    const options = priceListOptions()
    expect(options).toHaveLength(allCosts.length)
    expect(options).toContainEqual({
      slug: 'orthodontics',
      treatment: 'Orthodontics',
      detail: 'Illusion aligners (based on no. of trays)',
      cost: '45,000/- to 65,000/-',
      price: { kind: 'range', min: 45000, max: 65000 },
    })
    expect(options.find((o) => o.slug === 'root-canal-treatment')?.price).toEqual({ kind: 'fixed', amount: 3500 })
  })
})

describe('formatRupees', () => {
  it('uses ₹ and Indian grouping', () => {
    expect(formatRupees(0)).toBe('₹0')
    expect(formatRupees(200)).toBe('₹200')
    expect(formatRupees(3500)).toBe('₹3,500')
    expect(formatRupees(45000)).toBe('₹45,000')
    expect(formatRupees(125000)).toBe('₹1,25,000')
    expect(formatRupees(1234567)).toBe('₹12,34,567')
  })

  it('handles paise, negatives and bad input', () => {
    expect(formatRupees(99.5)).toBe('₹99.5')
    expect(formatRupees(1200.256)).toBe('₹1,200.26')
    expect(formatRupees(-500)).toBe('-₹500')
    expect(formatRupees(Number.NaN)).toBe('₹—')
  })
})

describe('formatPrice', () => {
  it('formats each kind', () => {
    expect(formatPrice({ kind: 'fixed', amount: 3499, note: 'Per Crown' })).toBe('₹3,499')
    expect(formatPrice({ kind: 'range', min: 45000, max: 65000 })).toBe('₹45,000–₹65,000')
    expect(formatPrice({ kind: 'formula', base: 1200, perUnit: 400, text: '' })).toBe('₹1,200 + ₹400 each')
    expect(formatPrice({ kind: 'unknown', text: 'On consultation' })).toBe('On consultation')
  })
})

describe('priceForPatients', () => {
  it('shows the short form, keeping a note such as per crown', () => {
    expect(priceForPatients('200/-')).toBe('₹200')
    expect(priceForPatients('3,499/- (Per Crown)')).toBe('₹3,499 per crown')
    expect(priceForPatients('45,000/- to 65,000/-')).toBe('₹45,000–₹65,000')
    expect(priceForPatients('1,25,000/-')).toBe('₹1,25,000')
    expect(priceForPatients('1,200/- + 400/-* number of additional teeth.')).toBe('₹1,200 + ₹400 each')
    expect(priceForPatients('On consultation')).toBe('On consultation')
  })
})
