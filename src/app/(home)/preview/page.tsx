import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { cacheLife } from 'next/cache'
import type { Metadata } from 'next'
import { CalendarDays, Check, Globe, GraduationCap, Phone } from 'lucide-react'
import { homeServices, siteConfig } from '@/config/site'
import { getOpenSlots } from '@/lib/actions/booking'
import { todayInIndia } from '@/lib/dates'
import { formatPhone, normalizePhone } from '@/lib/phone'
import { confirmationPromise } from '@/lib/schedule'
import { BookingCard } from '@/components/home/BookingCard'
import { BookLink } from '@/components/home/BookLink'
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
const hours = siteConfig.operatingHours[0].hours.map((h) => h.replace(' - ', ' – '))

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

// Directions, WhatsApp and the treatments: in the header on a wide screen, in a row under it on a phone
function QuickLinks({ wideOnly }: { wideOnly: boolean }) {
  const cls = `h-btn small glass${wideOnly ? ' h-wide-only' : ''}`
  return (
    <>
      <a href="#treatments" className={cls}>Treatments and prices</a>
      <a href="#doctor" className={cls}>Dr. Rahil</a>
      <a href={siteConfig.directionsLink} target="_blank" rel="noopener noreferrer" className={cls}>Get directions</a>
      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={cls}>WhatsApp the clinic</a>
    </>
  )
}

export default function HomePreview() {
  return (
    <div id="top" className="h-root">
      <section className="h-tide h-hero-section">
        <header className="h-wrap h-header">
          <a href="#top" className="h-brand">
            <Image src={siteConfig.media.logo} alt="Smile Dental Clinic logo" width={44} height={44} className="h-brand-logo" priority />
            <span className="h-brand-text">
              <span className="h-brand-name">{siteConfig.name}</span>
              <span className="h-brand-place">Katapadi, Udupi</span>
            </span>
          </a>
          <nav aria-label="Main" className="h-nav">
            <QuickLinks wideOnly />
            <a href={tel} className="h-btn small glass icon" aria-label={`Call the clinic, ${phoneShown}`}>
              <Phone className="h-icon" aria-hidden="true" />
            </a>
            <a href="#book" className="h-btn small amber on-dark">Book appointment</a>
          </nav>
          <nav aria-label="Quick links" className="h-quick">
            <QuickLinks wideOnly={false} />
          </nav>
        </header>

        <div className="h-wrap h-hero">
          <div className="h-hero-text">
            <p className="h-eyebrow amber">{siteConfig.dentist.name}, BDS</p>
            <h1 className="h-serif h-h1">A dentist who takes the time to <em>explain</em>.</h1>
            <p className="h-hero-lead">
              Check-ups, cleaning, fillings, root canals, crowns, braces and dentures on Shirva Road, Katapadi. See the
              price, pick a free time, and the clinic confirms it on WhatsApp.
            </p>
          </div>
          {/* Dr. Rahil as a player card: his photo in a three-part ring, years as a level, his record as badges.
              Under the headline on a wide screen; after the booking card on a phone. */}
          <div className="h-player">
              <div className="h-player-photo">
                <svg className="h-ring" viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="56" pathLength="300" className="h-ring-track" />
                  <circle cx="60" cy="60" r="56" pathLength="300" className="h-ring-arc a1" />
                  <circle cx="60" cy="60" r="56" pathLength="300" className="h-ring-arc a2" />
                  <circle cx="60" cy="60" r="56" pathLength="300" className="h-ring-arc a3" />
                </svg>
                <Image src={siteConfig.dentist.portraitPhoto} alt={siteConfig.dentist.name} width={112} height={112}
                  className="h-player-img" priority />
                <span className="h-level" aria-label="5 years of practice"><b>5</b><small>yrs</small></span>
              </div>
              <div className="h-player-body">
                <p className="h-player-role">Your dentist</p>
                <p className="h-player-name">{siteConfig.dentist.name}</p>
                <ul className="h-badges">
                  <li><GraduationCap aria-hidden="true" />BDS, Yenepoya, 2020</li>
                  <li><Globe aria-hidden="true" />India and the Middle East</li>
                  <li><Check aria-hidden="true" />Sees every patient himself</li>
                  <li><CalendarDays aria-hidden="true" />Open daily except Friday</li>
                </ul>
              </div>
          </div>
          <Suspense fallback={<BookingLoading />}>
            <Booking />
          </Suspense>
        </div>
        <Waves fill="#FFFFFF" />
      </section>

      <section id="treatments" className="h-section first">
        <div className="h-wrap">
          <div className="h-section-head">
            <div>
              <p className="h-eyebrow">Treatments and prices</p>
              <h2 className="h-serif h-h2">Everything the clinic does, with the price.</h2>
            </div>
            <p className="h-lead h-head-note">
              The clinic&apos;s own prices. Some depend on the material chosen or how much work a tooth needs; the full
              list shows every option.
            </p>
          </div>
          <div className="h-menu">
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
        <ToothChart />
      </section>

      <section id="doctor" className="h-section">
        <div className="h-wrap h-split h-center-items">
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

      <section id="visit" className="h-tide h-visit">
        <Waves fill="#FFFFFF" top />
        <div className="h-wrap h-split">
          <div className="h-col" style={{ flex: '1 1 400px' }}>
            <p className="h-eyebrow amber">Visit</p>
            <h2 className="h-serif h-h2 light">Find us on Shirva Road.</h2>
            <p className="h-visit-address">{siteConfig.address}</p>
            <div className="h-btn-row">
              <a href="#book" className="h-btn amber on-dark">Book appointment</a>
              <a href={siteConfig.directionsLink} target="_blank" rel="noopener noreferrer" className="h-btn glass">Get directions</a>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="h-btn glass">WhatsApp the clinic</a>
            </div>
          </div>
          <dl className="h-hours">
            <dt>Every day</dt>
            <dd>{hours[0]}<br />{hours[1]}</dd>
            <dt>Friday</dt>
            <dd>Closed</dd>
            <dt>Phone</dt>
            <dd><a href={tel}>{phoneShown}</a></dd>
          </dl>
        </div>
        <p className="h-wrap h-footer-line">
          © <Year /> {siteConfig.name}, Katapadi · <Link href="/privacy">Privacy</Link> · <Link href="/app">Clinic login</Link>
        </p>
      </section>
    </div>
  )
}
