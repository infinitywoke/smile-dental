import { describe, expect, it } from 'vitest'
import { chargeName, priceListOptions } from './pricing'
import { usualCharges, usualLabel } from './usual-charges'

const options = priceListOptions()
const fixed = options.filter((o) => o.price.kind === 'fixed')

describe('usual charges', () => {
  it('start with the common treatments while there is no history, all at fixed prices', () => {
    const usual = usualCharges([])
    expect(usual).toHaveLength(6)
    expect(usual.map((u) => u.label)).toEqual(expect.arrayContaining(['Consultation', 'X-ray', 'Root canal']))
    for (const u of usual) {
      const option = fixed.find((o) => chargeName(o) === u.description)
      expect(option, u.description).toBeDefined()
      expect(u.amount).toBe(option!.price.kind === 'fixed' ? option!.price.amount : NaN)
      expect(u.slug).toBe(option!.slug)
    }
  })

  it('put what he bills most first, ignore charges that are not fixed-price list items, and never repeat one', () => {
    const z350 = fixed.find((o) => chargeName(o) === 'Fillings – 3M Z350 Composite')!
    const ranged = options.find((o) => o.price.kind !== 'fixed')!
    const usual = usualCharges([
      { description: 'Consultation – Standard Consultation', count: 3 },
      { description: chargeName(z350), count: 9 },
      { description: chargeName(ranged), count: 20 },
      { description: 'Something typed by hand', count: 50 },
    ])
    expect(usual[0].description).toBe(chargeName(z350))
    expect(usual[1].description).toBe('Consultation – Standard Consultation')
    expect(usual).toHaveLength(6)
    expect(new Set(usual.map((u) => u.description)).size).toBe(6)
    expect(usual.some((u) => u.description === chargeName(ranged))).toBe(false)
  })

  it('count charges added from a recording, which carry their teeth, with their price-list item', () => {
    const usual = usualCharges([
      { description: 'Consultation – Standard Consultation', count: 3 },
      { description: 'Root Canal Treatment – Standard Treatment (46)', count: 2 },
      { description: 'Root Canal Treatment – Standard Treatment (36)', count: 2 },
    ])
    expect(usual.map((u) => u.description).slice(0, 2)).toEqual(['Root Canal Treatment – Standard Treatment', 'Consultation – Standard Consultation'])
    expect(usual.filter((u) => u.description.startsWith('Root Canal'))).toHaveLength(1)
  })

  it('give each button a short name', () => {
    expect(usualLabel({ treatment: 'Consultation', detail: 'Standard Consultation' })).toBe('Consultation')
    expect(usualLabel({ treatment: 'Scaling / Teeth Cleaning / Prophylaxis', detail: 'Mild case' })).toBe('Scaling · Mild case')
    expect(usualLabel({ treatment: 'Tooth Extraction', detail: 'Regular Extraction' })).toBe('Regular Extraction')
    expect(usualLabel({ treatment: 'Fillings', detail: '3M Z350 Composite' })).toBe('3M Z350 Composite')
    expect(usualLabel({ treatment: 'Root Canal Treatment', detail: 'Standard Treatment' })).toBe('Root canal')
    expect(usualLabel({ treatment: 'X-Ray', detail: 'Standard X-Ray' })).toBe('X-ray')
    // An add-on keeps its own name, never the treatment's
    expect(usualLabel({ treatment: 'Tooth Extraction', detail: 'Suture/Stitch' })).toBe('Tooth extraction · Suture/Stitch')
  })
})
