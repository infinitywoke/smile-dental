import { describe, expect, it } from 'vitest'
import { siteConfig, treatments } from '@/config/site'
import { listFor, rowsFrom, type PriceRow } from './price-list'

const row: PriceRow = { slug: 'scaling', treatment: 'Scaling', description: 'Cleaning.', detail: 'Full mouth', cost: '800/-' }

describe("a clinic's price list", () => {
  it('is the rows it has, whichever clinic it is', () => {
    expect(listFor([row], 'demo-brightside').map((t) => t.name)).toEqual(['Scaling'])
    expect(listFor([row], siteConfig.clinicSlug).map((t) => t.name)).toEqual(['Scaling'])
  })

  it("with none, only this website's clinic falls back to the list in the app", () => {
    expect(listFor([], siteConfig.clinicSlug)).toBe(treatments)
    expect(listFor([], 'demo-brightside')).toEqual([])
  })

  it('the list in the app goes through rows and back the same', () => {
    expect(listFor(rowsFrom(treatments), 'x').map((t) => [t.slug, t.pricing?.length]))
      .toEqual(treatments.filter((t) => t.pricing?.length).map((t) => [t.slug, t.pricing?.length]))
  })
})
