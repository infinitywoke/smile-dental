import { connection } from 'next/server'
import { getOpenSlots } from '@/lib/actions/booking'
import { reasonFromLink } from '@/lib/booking-reasons'
import { todayInIndia } from '@/lib/dates'
import { confirmationPromise } from '@/lib/schedule'
import { BookingCard } from './BookingCard'

// The free times come from the clinic's calendar at the moment the page is opened. A booking link may
// carry the reason (?reason=rootcanal), which the card then starts with.
export async function Booking({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await connection()
  const reason = searchParams ? reasonFromLink((await searchParams).reason) : null
  const slots = await getOpenSlots()
  return <BookingCard slots={slots} today={todayInIndia()} promise={confirmationPromise(new Date())} initialReason={reason} />
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
        <li><span>1</span><p><b>Pick a free time</b> from Dr. Rahil&apos;s own calendar.</p></li>
        <li><span>2</span><p><b>WhatsApp opens</b> with your request written. Tap Send.</p></li>
        <li><span>3</span><p><b>Dr. Rahil confirms</b> your time on WhatsApp.</p></li>
      </ol>
    </div>
  )
}
