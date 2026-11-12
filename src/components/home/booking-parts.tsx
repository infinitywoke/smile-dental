import { MessageCircle, Phone } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { PHONE_SHOWN, TEL, WHATSAPP } from './site-links'

// The booking card's other faces, for the page as built and in the browser alike

export function BookingLoading() {
  return (
    <div id="book" className="h-card">
      <h2 className="h-serif h-card-title">Book an appointment</h2>
      <p className="h-sub">Loading free times…</p>
    </div>
  )
}

// While online booking is paused (from the Cockpit), or the free times can't be had, visitors call or WhatsApp
export function BookingByPhone({ why }: { why: 'paused' | 'unavailable' }) {
  return (
    <div id="book" className="h-card">
      <h2 className="h-serif h-card-title">Book an appointment</h2>
      <p className="h-callout">
        {why === 'paused' ? 'Online booking is paused right now.' : "The free times can't be shown right now."} Please call or WhatsApp the
        clinic, and {siteConfig.dentist.short} will find you a time.
      </p>
      <a href={TEL} className="h-btn navy wide h-gap"><Phone className="h-icon" aria-hidden="true" /> Call {PHONE_SHOWN}</a>
      <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="h-btn amber wide h-gap"><MessageCircle className="h-icon" aria-hidden="true" /> WhatsApp the clinic</a>
    </div>
  )
}

export function HowBooking() {
  return (
    <div className="h-how">
      <p className="h-how-title">How booking works</p>
      <ol>
        <li><span>1</span><p><b>Pick a free time</b> from {siteConfig.dentist.short}&apos;s own calendar.</p></li>
        <li><span>2</span><p><b>WhatsApp opens</b> with your request written. Tap Send.</p></li>
        <li><span>3</span><p><b>{siteConfig.dentist.short} confirms</b> your time on WhatsApp.</p></li>
      </ol>
    </div>
  )
}
