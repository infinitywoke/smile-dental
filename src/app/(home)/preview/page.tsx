import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Check } from 'lucide-react'
import { homeServices, siteConfig } from '@/config/site'
import { OPEN_SESSIONS } from '@/lib/clinic-hours'
import { BookLink } from '@/components/home/BookLink'
import { Booking, BookingLoading, HowBooking } from '@/components/home/BookingSection'
import { OpenStatus } from '@/components/home/OpenStatus'
import { Questions, questions } from '@/components/home/Questions'
import { ToothChart } from '@/components/home/ToothChart'
import { Waves } from '@/components/home/Waves'
import { sitePath } from '@/components/home/site-links'

// Website D, the new homepage, for Rahil to try before it replaces the current one
export const metadata: Metadata = {
  title: 'Smile Dental Clinic, Katapadi',
  description: siteConfig.description,
}

// What search engines read: the clinic, its hours and place, and the questions below
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Dentist',
  name: siteConfig.name,
  description: siteConfig.description,
  url: siteConfig.url,
  telephone: siteConfig.phone,
  image: `${siteConfig.url}${siteConfig.dentist.portraitPhoto}`,
  address: {
    '@type': 'PostalAddress',
    streetAddress: siteConfig.address,
    addressLocality: 'Katapadi',
    addressRegion: 'Karnataka',
    postalCode: '574105',
    addressCountry: 'IN',
  },
  // From the clinic's Google Maps place
  geo: { '@type': 'GeoCoordinates', latitude: 13.2845037, longitude: 74.7497085 },
  hasMap: siteConfig.directionsLink,
  openingHoursSpecification: OPEN_SESSIONS.map(([opens, closes]) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday', 'Sunday'],
    opens,
    closes,
  })),
  employee: { '@type': 'Person', name: siteConfig.dentist.name, jobTitle: 'Dentist (BDS)' },
}
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: questions.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
}

export default function HomePreview() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <section className="h-tide h-hero-section">
        <div className="h-wrap h-hero">
          <div className="h-hero-text">
            <h1 className="h-serif h-h1">A dentist who takes the time to <em>explain</em>.</h1>
            <p className="h-hero-lead">
              Check-ups, cleaning, fillings, root canals, crowns, braces and dentures on Shirva Road, Katapadi. Every
              price is on this page.
            </p>
            {/* Dr. Rahil, signed under the headline: his photo in a three-part ring, his years as a level */}
            <div className="h-byline">
              <div className="h-byline-photo">
                <svg className="h-ring" viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="56" pathLength="300" className="h-ring-track" />
                  <circle cx="60" cy="60" r="56" pathLength="300" className="h-ring-arc a1" />
                  <circle cx="60" cy="60" r="56" pathLength="300" className="h-ring-arc a2" />
                  <circle cx="60" cy="60" r="56" pathLength="300" className="h-ring-arc a3" />
                </svg>
                <Image src={siteConfig.dentist.portraitPhoto} alt={siteConfig.dentist.name} width={64} height={64}
                  className="h-byline-img" priority />
                <span className="h-level" aria-label="5 years of practice"><b>5</b><small>yrs</small></span>
              </div>
              <div className="h-byline-text">
                <p className="h-byline-name">{siteConfig.dentist.name}, BDS</p>
                <p className="h-byline-meta">Yenepoya, 2020 · India and the Middle East<br />Sees every patient himself</p>
              </div>
            </div>
            <OpenStatus />
          </div>

          <div id="book-zone" className="h-book-zone">
            <Suspense fallback={<BookingLoading />}>
              <Booking />
            </Suspense>
          </div>

          <HowBooking />
        </div>
        <Waves fill="#FFFFFF" />
      </section>

      <section id="treatments" className="h-section first">
        <div className="h-wrap">
          <div className="h-section-head" data-reveal>
            <div>
              <p className="h-eyebrow">Treatments and prices</p>
              <h2 className="h-serif h-h2">Everything the clinic does, with the price.</h2>
            </div>
            <p className="h-lead h-head-note">
              The clinic&apos;s own prices. Some depend on the material chosen or how much work a tooth needs; the full
              list shows every option.
            </p>
          </div>
          <div className="h-menu" data-reveal>
            {homeServices.map((service) => (
              <div key={service.id} className="h-menu-row">
                <div className="h-leader-row big">
                  <h3>{service.name}</h3>
                  <span className="h-leader" />
                  <strong>{service.price}</strong>
                </div>
                <div className="h-menu-line">
                  <p>{service.line}</p>
                  <BookLink reason={service.id} label={service.name} className="h-booklink">Book</BookLink>
                </div>
              </div>
            ))}
          </div>
          <Link href={sitePath('/treatments')} className="h-btn h-after">See the full price list</Link>
        </div>
      </section>

      <section id="not-sure" className="h-section mist">
        <div data-reveal>
          <ToothChart />
        </div>
      </section>

      <section id="doctor" className="h-section">
        <div className="h-wrap h-split h-center-items" data-reveal>
          <div className="h-portrait-wrap">
            <Image src={siteConfig.dentist.portraitPhoto} alt={siteConfig.dentist.name} width={380} height={475}
              className="h-portrait" sizes="(max-width: 700px) 90vw, 380px" />
          </div>
          <div className="h-col" style={{ flex: '1 1 460px' }}>
            <p className="h-eyebrow">Your dentist</p>
            <h2 className="h-serif h-h2">{siteConfig.dentist.name}, BDS</h2>
            <p className="h-serif h-quote">
              He takes the time to understand each patient&apos;s needs and explains treatment options in a simple and
              reassuring way.
            </p>
            <ul className="h-checks">
              <li><Check aria-hidden="true" />BDS from Yenepoya (Deemed to be University), 2020</li>
              <li><Check aria-hidden="true" />5 years of practice in India and the Middle East</li>
              <li><Check aria-hidden="true" />Sees every patient himself, from the first check-up to the last sitting</li>
            </ul>
            <a href="#book" className="h-btn amber">Book with Dr. Rahil</a>
          </div>
        </div>
      </section>

      <Questions />
    </>
  )
}
