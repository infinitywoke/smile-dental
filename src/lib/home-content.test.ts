import { describe, expect, it } from 'vitest'
import { homeServices, toothAreas, treatments } from '@/config/site'

// Every rupee amount on the new homepage must come from the clinic's own price list
const amounts = (text: string) => [...text.matchAll(/\d{1,3}(?:,\d{2,3})*/g)].map((m) => Number(m[0].replace(/,/g, '')))
const listed = (slugs: string[]) => {
  const found = new Set<number>()
  for (const slug of slugs) {
    const treatment = treatments.find((t) => t.slug === slug)
    expect(treatment, `price list has ${slug}`).toBeTruthy()
    for (const { cost } of treatment!.pricing ?? []) for (const n of amounts(cost)) found.add(n)
  }
  return found
}
const rupees = (text: string) => [...text.matchAll(/₹\s?([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')))

describe('homepage prices', () => {
  it.each(homeServices.map((s) => [s.name, s] as const))('%s matches the price list', (_, service) => {
    const known = listed(service.slugs)
    const shown = [...rupees(service.price), ...rupees(service.line)]
    expect(shown.length).toBeGreaterThan(0)
    for (const n of shown) expect(known, `${n} in ${service.slugs.join(', ')}`).toContain(n)
  })

  it.each(Object.entries(toothAreas))('the %s area matches the price list', (_, area) => {
    const known = listed(area.slugs)
    for (const [label, price] of area.items) {
      for (const n of rupees(price)) expect(known, `${label}: ${n}`).toContain(n)
    }
  })

  it('has one row per kind of treatment, each id once', () => {
    expect(new Set(homeServices.map((s) => s.id)).size).toBe(homeServices.length)
  })

  // The treatments page lists the price list under these rows, so nothing may be left out or shown twice
  it('puts every price-list treatment under exactly one row', () => {
    for (const t of treatments) {
      expect(homeServices.filter((s) => s.slugs.includes(t.slug)).map((s) => s.id), t.slug).toHaveLength(1)
    }
  })
})
