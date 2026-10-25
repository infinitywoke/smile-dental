import { describe, expect, it } from 'vitest'
import { homeServices, treatments } from '@/config/site'
import { fillPrices, homeServicesFor, rowsFrom, toothAreasFor, treatmentGroups, treatmentsFrom } from './price-list'

// The homepage's prices are filled from the clinic's price list, so they always follow it
describe('homepage prices', () => {
  it('read as they always have, from the list in the app', () => {
    const shown = Object.fromEntries(homeServicesFor(treatments).map((s) => [s.id, s.price]))
    expect(shown).toEqual({
      checkup: '₹200', cleaning: '₹400 – ₹800', filling: 'from ₹700', rootcanal: '₹3,500',
      crown: 'from ₹3,499', braces: 'from ₹25,000', removal: 'from ₹500', dentures: 'from ₹1,200',
    })
    expect(homeServicesFor(treatments).find((s) => s.id === 'checkup')!.line).toBe('An examination by Dr. Rahil; an X-ray, if needed, is ₹350.')
    const areas = toothAreasFor(treatments)
    expect(areas.front.items).toEqual([['Tooth-coloured filling', 'from ₹800'], ['Ceramic crown', 'from ₹3,499'], ['Metal braces', 'from ₹25,000'], ['Clear aligners', '₹45,000 – ₹65,000']])
    expect(areas.back.items).toEqual([['Check-up', '₹200'], ['Filling', 'from ₹700'], ['Root canal treatment', '₹3,500'], ['Ceramic crown', 'from ₹3,499']])
    expect(areas.wisdom.items).toEqual([['X-ray', '₹350'], ['Wisdom tooth removal', '₹800'], ['Difficult removal', '₹1,200']])
    expect(areas.gums.items).toEqual([['Cleaning, mild', '₹400'], ['Cleaning, moderate', '₹600'], ['Cleaning, severe', '₹800'], ['Polishing', '₹300']])
    expect(areas.missing.items).toEqual([['Partial denture, one tooth', '₹1,200'], ['Each extra tooth', '+ ₹400'], ['Ceramic bridge', 'from ₹3,499 a tooth'], ['Complete dentures', 'from ₹7,000']])
  })

  it('follow a price changed in the sheet', () => {
    const changed = treatmentsFrom(rowsFrom(treatments).map((r) => (r.detail === 'Mild case' ? { ...r, cost: '450/-' } : r)))
    expect(homeServicesFor(changed).find((s) => s.id === 'cleaning')!.price).toBe('₹450 – ₹800')
    expect(toothAreasFor(changed).gums.items[0]).toEqual(['Cleaning, mild', '₹450'])
  })

  it('leave out a price the list no longer has, never showing an old one', () => {
    const without = treatments.filter((t) => t.slug !== 'x-ray')
    const checkup = homeServicesFor(without).find((s) => s.id === 'checkup')!
    expect(checkup.price).toBe('₹200')
    expect(checkup.line).toBe('An examination by Dr. Rahil.')
    expect(toothAreasFor(without).wisdom.items).toEqual([['Wisdom tooth removal', '₹800'], ['Difficult removal', '₹1,200']])
    expect(fillPrices('from {fillings|No such filling}', treatments)).toBeNull()
  })

  it('has one row per kind of treatment, each id once', () => {
    expect(new Set(homeServices.map((s) => s.id)).size).toBe(homeServices.length)
  })

  // The treatments page lists the price list under these rows, so nothing may be left out or shown twice
  it('puts every price-list treatment under exactly one row, and one the sheet added under Other treatments', () => {
    for (const t of treatments) {
      expect(homeServices.filter((s) => s.slugs.includes(t.slug)).map((s) => s.id), t.slug).toHaveLength(1)
    }
    expect(treatmentGroups(treatments).map((g) => g.id)).not.toContain('other')
    const added = [...treatments, { slug: 'teeth-whitening', name: 'Teeth Whitening', shortDescription: '', isVerified: true, pricing: [{ detail: 'In clinic', cost: '5,000/-' }] }]
    const groups = treatmentGroups(added)
    expect(groups.at(-1)).toMatchObject({ id: 'other', name: 'Other treatments' })
    expect(groups.at(-1)!.items.map((t) => t.slug)).toEqual(['teeth-whitening'])
    expect(groups.flatMap((g) => g.items).length).toBe(added.length)
  })

  it('reads the list back from its rows exactly', () => {
    expect(treatmentsFrom(rowsFrom(treatments)).map((t) => ({ ...t, description: undefined }))).toEqual(treatments.map((t) => ({ ...t, description: undefined })))
  })
})
