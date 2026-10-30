import { connection } from 'next/server'
import { MessageCircle, Phone } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { getBookingPause, getOpenSlots } from '@/lib/actions/booking'
import { reasonFromLink } from '@/lib/booking-reasons'
import { getWebsiteTreatments } from '@/lib/data/price-list'
import { homeServicesFor } from '@/lib/price-list'
import { todayInIndia } from '@/lib/dates'
import { confirmationPromise } from '@/lib/schedule'
import { BookingCard } from './BookingCard'
import { PHONE_SHOWN, TEL, WHATSAPP } from './site-links'

// The free times come from the clinic's calendar at the moment the page is opened. A booking link may
// carry the reason (?reason=rootcanal), which the card then starts with. While Dr. Rahil has paused
// online booking (from the Cockpit), the card asks visitors to call or WhatsApp instead.
export async function Booking({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await connection()
  const reason = searchParams ? reasonFromLink((await searchParams).reason) : null
  const [slots, pause, list] = await Promise.all([getOpenSlots(), getBookingPause(siteConfig.clinicSlug), getWebsiteTreatments()])
  if (pause.until) return <BookingPaused />
  return <BookingCard slots={slots} today={todayInIndia()} promise={confirmationPromise(new Date(), siteConfig.dentist.short)} initialReason={reason} services={homeServicesFor(list)} />
}

function BookingPaused() {
  return (
    <div id="book" className="h-card">
      <h2 className="h-serif h-card-title">Book an appointment</h2>
      <p className="h-callout">Online booking is paused right now. Please call or WhatsApp the clinic, and {siteConfig.dentist.short} will find you a time.</p>
      <a href={TEL} className="h-btn navy wide h-gap"><Phone className="h-icon" aria-hidden="true" /> Call {PHONE_SHOWN}</a>
      <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="h-btn amber wide h-gap"><MessageCircle className="h-icon" aria-hidden="true" /> WhatsApp the clinic</a>
    </div>
  )
}

export function BookingLoading() {
  return (
    <div id="book" className="h-card">
      <h2 className="h-serif h-card-title">Book an appointment</h2>
      <p className="h-sub">Loading free times…</p>
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
