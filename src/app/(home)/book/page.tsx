import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Booking, BookingLoading, HowBooking } from '@/components/home/BookingSection'
import { OpenStatus } from '@/components/home/OpenStatus'
import { Questions } from '@/components/home/Questions'
import { Waves } from '@/components/home/Waves'

export const metadata: Metadata = {
  title: 'Book an appointment · Smile Dental Clinic, Katapadi',
  description: "Pick a free time from Dr. Rahil Yusuf's calendar at Smile Dental Clinic, Katapadi. The clinic confirms your time on WhatsApp.",
}

// The booking card on a page of its own, for links that go straight to booking: the Google profile's
// appointment link, and Book on a treatment's page (?reason=)
export default function BookPage({ searchParams }: PageProps<'/book'>) {
  return (
    <>
      <section className="h-tide h-hero-section">
        <div className="h-wrap h-hero">
          <div className="h-hero-text">
            <h1 className="h-serif h-h1">Book a visit with Dr. Rahil.</h1>
            <p className="h-hero-lead">
              The free times come from his own calendar. Pick one, and WhatsApp opens with your request written; the
              clinic confirms your time.
            </p>
            <OpenStatus />
          </div>

          <div id="book-zone" className="h-book-zone">
            <Suspense fallback={<BookingLoading />}>
              <Booking searchParams={searchParams} />
            </Suspense>
          </div>

          <HowBooking />
        </div>
        <Waves fill="#F3F6FB" />
      </section>

      <Questions />
    </>
  )
}
