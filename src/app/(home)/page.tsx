import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Check } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { getWebsiteTreatments } from '@/lib/data/price-list'
import { homeServicesFor, toothAreasFor } from '@/lib/price-list'
import { clinicJsonLd, faqJsonLd } from '@/lib/structured-data'
import { BookLink } from '@/components/home/BookLink'
import { Booking, BookingLoading, HowBooking } from '@/components/home/BookingSection'
import { JsonLd } from '@/components/home/JsonLd'
import { OpenStatus } from '@/components/home/OpenStatus'
import { Questions, questions } from '@/components/home/Questions'
import { ToothChart } from '@/components/home/ToothChart'
import { Waves } from '@/components/home/Waves'

// The homepage (website D): booking first, then the treatments and prices, the tooth chart, the dentist and questions
export const metadata: Metadata = {
  title: `${siteConfig.name}, ${siteConfig.area} · ${siteConfig.dentist.name}, ${siteConfig.dentist.degree}`,
  description: siteConfig.description,
  alternates: { canonical: '/', types: { 'text/markdown': '/index.md' } },
}

export default async function HomePage() {
  // Every price on the page comes from the clinic's price list
  const list = await getWebsiteTreatments()
  return (
    <>
      {/* What search engines and AI assistants read: the clinic, its hours, place and prices, and the questions below */}
      <JsonLd data={clinicJsonLd(list)} />
      <JsonLd data={faqJsonLd(questions)} />

      <section className="h-tide h-hero-section">
        <div className="h-wrap h-hero">
          <div className="h-hero-text">
            <h1 className="h-serif h-h1">A dentist who takes the time to <em>explain</em>.</h1>
            <p className="h-hero-lead">
              Check-ups, cleaning, fillings, root canals, crowns, braces and dentures on {siteConfig.street}, {siteConfig.place}. Every
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
                <span className="h-level" aria-label={`${siteConfig.dentist.years} years of practice`}><b>{siteConfig.dentist.years}</b><small>yrs</small></span>
              </div>
              <div className="h-byline-text">
                <p className="h-byline-name">{siteConfig.dentist.name}, {siteConfig.dentist.degree}</p>
                <p className="h-byline-meta">{siteConfig.dentist.byline[0]}<br />{siteConfig.dentist.byline[1]}</p>
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
            {homeServicesFor(list).map((service) => (
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
          <Link href="/treatments" className="h-btn h-after">See the full price list</Link>
        </div>
      </section>

      <section id="not-sure" className="h-section mist">
        <div data-reveal>
          <ToothChart areas={toothAreasFor(list)} />
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
            <h2 className="h-serif h-h2">{siteConfig.dentist.name}, {siteConfig.dentist.degree}</h2>
            <p className="h-serif h-quote">
              {siteConfig.dentist.quote}
            </p>
            <ul className="h-checks">
              {siteConfig.dentist.points.map((point) => <li key={point}><Check aria-hidden="true" />{point}</li>)}
            </ul>
            <a href="#book" className="h-btn amber">Book with {siteConfig.dentist.short}</a>
          </div>
        </div>
      </section>

      <Questions />
    </>
  )
}
