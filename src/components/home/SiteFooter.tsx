import Link from 'next/link'
import { cacheLife } from 'next/cache'
import { siteConfig } from '@/config/site'
import { BookButton } from './BookButton'
import { OpenStatus } from './OpenStatus'
import { Waves } from './Waves'
import { HOURS, PHONE_SHOWN, TEL, WHATSAPP, sitePath } from './site-links'

async function Year() {
  'use cache'
  cacheLife('days')
  return new Date().getFullYear()
}

// Every page ends the same way: where the clinic is, when it is open, the ways to book or ask, and the
// map. Each page's last section is the pale mist colour, which the tide line runs out of.
export function SiteFooter() {
  return (
    <footer id="visit" className="h-tide h-visit">
      <Waves fill="#F3F6FB" top />
      <div className="h-wrap h-split">
        <div className="h-col" style={{ flex: '1 1 380px' }}>
          <p className="h-eyebrow amber">Visit</p>
          <h2 className="h-serif h-h2 light">Find us on Shirva Road.</h2>
          <p className="h-visit-address">{siteConfig.address}</p>
          <OpenStatus />
          <dl className="h-hours">
            <dt>Every day</dt>
            <dd>{HOURS[0]}<br />{HOURS[1]}</dd>
            <dt>Friday</dt>
            <dd>Closed</dd>
            <dt>Phone</dt>
            <dd><a href={TEL}>{PHONE_SHOWN}</a></dd>
          </dl>
          <div className="h-btn-row">
            <BookButton className="h-btn amber on-dark" />
            <a href={siteConfig.directionsLink} target="_blank" rel="noopener noreferrer" className="h-btn glass">Get directions</a>
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="h-btn glass">WhatsApp the clinic</a>
          </div>
        </div>
        <div className="h-col h-map-frame" style={{ flex: '1.2 1 420px' }}>
          <iframe src={siteConfig.mapEmbedLink} title="Map of Smile Dental Clinic, Katapadi" className="h-map"
            loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
        </div>
      </div>
      <p className="h-wrap h-footer-line">
        © <Year /> {siteConfig.name}, Katapadi · <Link href={sitePath('/treatments')}>Treatments and prices</Link> ·{' '}
        <Link href={sitePath('/privacy')}>Privacy</Link> · <Link href="/app">Clinic login</Link>
      </p>
    </footer>
  )
}
