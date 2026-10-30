import { homeServices, siteConfig, treatments, type Treatment } from '@/config/site'
import { treatmentGroups } from '@/lib/price-list'
import { OPEN_SESSIONS } from '@/lib/clinic-hours'
import { formatRupees, parsePrice, priceForPatients } from '@/lib/pricing'

// What search engines and AI assistants read (schema.org JSON-LD): the clinic, its hours and place, its
// questions, and every price from the clinic's own price list, the same list the pages show (src/lib/data/price-list.ts;
// the list in the app when none is given)

const CLINIC_ID = `${siteConfig.url}/#clinic`

const address = {
  '@type': 'PostalAddress',
  streetAddress: siteConfig.address,
  addressLocality: 'Katapadi',
  addressRegion: 'Karnataka',
  postalCode: '574105',
  addressCountry: 'IN',
}

// The lowest and highest amounts on the price list: "₹200–₹1,25,000"
export function priceRange(list: Treatment[] = treatments): string {
  const amounts = list.flatMap((t) => (t.pricing ?? []).flatMap(({ cost }) => {
    const price = parsePrice(cost)
    if (price.kind === 'fixed') return [price.amount]
    if (price.kind === 'range') return [price.min, price.max]
    if (price.kind === 'formula') return [price.base]
    return []
  }))
  return `${formatRupees(Math.min(...amounts))}–${formatRupees(Math.max(...amounts))}`
}

// One option on the price list: a fixed price, a range, or a starting price with its rule in words
export function offerFor(treatment: Treatment, option: { detail: string; cost: string }) {
  const price = parsePrice(option.cost)
  const offer = {
    '@type': 'Offer',
    name: option.detail,
    description: priceForPatients(option.cost),
    itemOffered: { '@type': 'Service', name: `${treatment.name}: ${option.detail}` },
    url: `${siteConfig.url}/treatments/${treatment.slug}`,
    priceCurrency: 'INR',
  }
  if (price.kind === 'fixed') return { ...offer, price: price.amount }
  if (price.kind === 'formula') return { ...offer, price: price.base }
  if (price.kind === 'range') {
    return { ...offer, priceSpecification: { '@type': 'PriceSpecification', minPrice: price.min, maxPrice: price.max, priceCurrency: 'INR' } }
  }
  return offer
}

// The homepage: the clinic itself
export function clinicJsonLd(list: Treatment[] = treatments) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    '@id': CLINIC_ID,
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    telephone: siteConfig.phone,
    email: siteConfig.email,
    image: `${siteConfig.url}${siteConfig.dentist.portraitPhoto}`,
    logo: `${siteConfig.url}${siteConfig.media.logo}`,
    medicalSpecialty: 'https://schema.org/Dentistry',
    isAcceptingNewPatients: true,
    // The clinic's place on Google Maps
    sameAs: [siteConfig.directionsLink],
    address,
    // From the clinic's Google Maps place
    geo: { '@type': 'GeoCoordinates', latitude: 13.2845037, longitude: 74.7497085 },
    hasMap: siteConfig.directionsLink,
    priceRange: priceRange(list),
    currenciesAccepted: 'INR',
    paymentAccepted: 'Cash, UPI',
    openingHoursSpecification: OPEN_SESSIONS.map(([opens, closes]) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday', 'Sunday'],
      opens,
      closes,
    })),
    employee: { '@type': 'Person', name: siteConfig.dentist.name, jobTitle: 'Dentist (BDS)' },
    // Where to book, for search engines and AI agents: the booking page
    potentialAction: {
      '@type': 'ReserveAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteConfig.url}/book`,
        actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'],
      },
      result: { '@type': 'Reservation', name: 'Dental appointment' },
    },
  }
}

// The questions on the page, with their answers
export function faqJsonLd(questions: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
  }
}

// The price list page: every treatment under the homepage's headings, each option with its price
export function priceListJsonLd(list: Treatment[] = treatments) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    '@id': CLINIC_ID,
    name: siteConfig.name,
    url: siteConfig.url,
    priceRange: priceRange(list),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Treatments and prices',
      itemListElement: treatmentGroups(list).map((group) => ({
        '@type': 'OfferCatalog',
        name: group.name,
        itemListElement: group.items
          .flatMap((t) => (t.pricing ?? []).map((option) => offerFor(t, option))),
      })),
    },
  }
}

// A treatment's page: the treatment as one of the clinic's services, with every option's price
export function treatmentJsonLd(treatment: Treatment) {
  const heading = homeServices.find((s) => s.slugs.includes(treatment.slug))
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: treatment.name,
    description: treatment.description ?? treatment.shortDescription,
    url: `${siteConfig.url}/treatments/${treatment.slug}`,
    ...(heading ? { category: heading.name } : {}),
    provider: { '@type': 'Dentist', '@id': CLINIC_ID, name: siteConfig.name, telephone: siteConfig.phone, address },
    areaServed: { '@type': 'Place', name: 'Katapadi, Udupi' },
    offers: (treatment.pricing ?? []).map((option) => offerFor(treatment, option)),
  }
}
