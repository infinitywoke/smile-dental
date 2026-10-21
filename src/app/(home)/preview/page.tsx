import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { cacheLife } from 'next/cache'
import type { Metadata } from 'next'
import { Check, ChevronDown } from 'lucide-react'
import { faqs, homeServices, siteConfig } from '@/config/site'
import { getOpenSlots } from '@/lib/actions/booking'
import { OPEN_SESSIONS } from '@/lib/clinic-hours'
import { todayInIndia } from '@/lib/dates'
import { formatPhone, normalizePhone } from '@/lib/phone'
import { confirmationPromise, formatBlock } from '@/lib/schedule'
import { BookingCard } from '@/components/home/BookingCard'
import { BookLink } from '@/components/home/BookLink'
import { MobileBar } from '@/components/home/MobileBar'
import { OpenStatus } from '@/components/home/OpenStatus'
import { SiteHeader } from '@/components/home/SiteHeader'
import { ToothChart } from '@/components/home/ToothChart'
import { Waves } from '@/components/home/Waves'

// Website D, the new homepage, for Rahil to try before it replaces the current one. Kept out of search.
export const metadata: Metadata = {
  title: 'Smile Dental Clinic, Katapadi',
  description: siteConfig.description,
  robots: { index: false, follow: false },
}

const tel = `tel:${siteConfig.phone.replace(/[^\d+]/g, '')}`
const phoneShown = `+91 ${formatPhone(normalizePhone(siteConfig.phone) ?? siteConfig.phone)}`
const whatsapp = `https://wa.me/${siteConfig.whatsapp.replace(/\D/g, '')}`
const hours = OPEN_SESSIONS.map(([from, until]) => `${formatBlock(from)} – ${formatBlock(until)}`)
const questions = faqs.filter((f) => f.isVerified)

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

// The free times come from the clinic's calendar at the moment the page is opened
async function Booking() {
  await connection()
  const slots = await getOpenSlots()
  return <BookingCard slots={slots} today={todayInIndia()} promise={confirmationPromise(new Date())} />
}

function BookingLoading() {
  return (
    <div id="book" className="h-card">
      <h2 className="h-serif h-card-title">Book an appointment</h2>
      <p className="h-sub">Loading free times…</p>
    </div>
  )
}

async function Year() {
  'use cache'
  cacheLife('days')
  return new Date().getFullYear()
}

export default function HomePreview() {
  return (
    <div id="top" className="h-root">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <SiteHeader name={siteConfig.name} place="Katapadi, Udupi" logo={siteConfig.media.logo} tel={tel}
        phoneShown={phoneShown} whatsapp={whatsapp} directions={siteConfig.directionsLink} />

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

          <div className="h-how">
            <p className="h-how-title">How booking works</p>
            <ol>
              <li><span>1</span><p><b>Pick a free time</b> from Dr. Rahil&apos;s own calendar.</p></li>
              <li><span>2</span><p><b>WhatsApp opens</b> with your request written. Tap Send.</p></li>
              <li><span>3</span><p><b>Dr. Rahil confirms</b> your time on WhatsApp.</p></li>
            </ol>
          </div>
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
          <Link href="/treatments" className="h-btn h-after">See the full price list</Link>
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

      <section id="questions" className="h-section mist">
        <div className="h-wrap h-split">
          <div className="h-col" style={{ flex: '1 1 300px' }} data-reveal>
            <p className="h-eyebrow">Questions</p>
            <h2 className="h-serif h-h2">What patients ask.</h2>
            <p className="h-lead">
              Anything else? <a href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp the clinic</a> or{' '}
              <a href={tel}>call {phoneShown}</a>.
            </p>
          </div>
          <div className="h-col h-faq" style={{ flex: '1.5 1 460px' }} data-reveal>
            {questions.map((f) => (
              <details key={f.question} className="h-faq-item">
                <summary><span>{f.question}</span><ChevronDown className="h-icon" aria-hidden="true" /></summary>
                <p>{f.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="visit" className="h-tide h-visit">
        <Waves fill="#F3F6FB" top />
        <div className="h-wrap h-split">
          <div className="h-col" style={{ flex: '1 1 380px' }}>
            <p className="h-eyebrow amber">Visit</p>
            <h2 className="h-serif h-h2 light">Find us on Shirva Road.</h2>
            <p className="h-visit-address">{siteConfig.address}</p>
            <OpenStatus />
            <dl className="h-hours">
              <dt>Every day</dt>
              <dd>{hours[0]}<br />{hours[1]}</dd>
              <dt>Friday</dt>
              <dd>Closed</dd>
              <dt>Phone</dt>
              <dd><a href={tel}>{phoneShown}</a></dd>
            </dl>
            <div className="h-btn-row">
              <a href="#book" className="h-btn amber on-dark">Book appointment</a>
              <a href={siteConfig.directionsLink} target="_blank" rel="noopener noreferrer" className="h-btn glass">Get directions</a>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="h-btn glass">WhatsApp the clinic</a>
            </div>
          </div>
          <div className="h-col h-map-frame" style={{ flex: '1.2 1 420px' }}>
            <iframe src={siteConfig.mapEmbedLink} title="Map of Smile Dental Clinic, Katapadi" className="h-map"
              loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          </div>
        </div>
        <p className="h-wrap h-footer-line">
          © <Year /> {siteConfig.name}, Katapadi · <Link href="/privacy">Privacy</Link> · <Link href="/app">Clinic login</Link>
        </p>
      </section>

      <MobileBar whatsapp={whatsapp} />
    </div>
  )
}
