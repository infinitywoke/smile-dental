import { describe, expect, it } from 'vitest'
import { faqs, treatments } from '@/config/site'
import { parsePrice } from './pricing'
import { clinicJsonLd, faqJsonLd, priceListJsonLd, priceRange, treatmentJsonLd } from './structured-data'

type Offer = { price?: number; priceCurrency: string; name: string; priceSpecification?: { minPrice: number; maxPrice: number } }
const options = treatments.flatMap((t) => (t.pricing ?? []).map((p) => ({ treatment: t, ...p })))

describe('structured data for search engines and AI assistants', () => {
  it('gives the clinic its price range from the price list', () => {
    expect(priceRange()).toBe('₹200–₹1,25,000')
    const clinic = clinicJsonLd()
    expect(clinic.priceRange).toBe(priceRange())
    expect(clinic.openingHoursSpecification.every((h) => !h.dayOfWeek.includes('Friday'))).toBe(true)
  })

  it('says where to book, for search engines and AI agents', () => {
    const action = clinicJsonLd().potentialAction
    expect(action['@type']).toBe('ReserveAction')
    expect(action.target.urlTemplate).toBe('https://www.smiledentalkatapadi.com/book')
    expect(clinicJsonLd().isAcceptingNewPatients).toBe(true)
  })

  it('puts every option of every treatment on its page, with the price list amount in rupees', () => {
    for (const t of treatments) {
      const offers = treatmentJsonLd(t).offers as Offer[]
      expect(offers.map((o) => o.name)).toEqual((t.pricing ?? []).map((p) => p.detail))
      offers.forEach((offer, i) => {
        const price = parsePrice(t.pricing![i].cost)
        expect(offer.priceCurrency).toBe('INR')
        if (price.kind === 'fixed') expect(offer.price).toBe(price.amount)
        if (price.kind === 'formula') expect(offer.price).toBe(price.base)
        if (price.kind === 'range') expect(offer.priceSpecification).toMatchObject({ minPrice: price.min, maxPrice: price.max })
      })
    }
  })

  it('lists each price-list option exactly once on the price list page', () => {
    const groups = priceListJsonLd().hasOfferCatalog.itemListElement
    const listed = groups.flatMap((g) => g.itemListElement as Offer[])
    expect(listed).toHaveLength(options.length)
    expect(groups).toHaveLength(8)
  })

  it('answers only the checked questions, and stays valid JSON', () => {
    const verified = faqs.filter((f) => f.isVerified)
    expect(faqJsonLd(verified).mainEntity).toHaveLength(verified.length)
    for (const data of [clinicJsonLd(), priceListJsonLd(), ...treatments.map(treatmentJsonLd)]) {
      expect(JSON.parse(JSON.stringify(data))).toEqual(data)
    }
  })
})
