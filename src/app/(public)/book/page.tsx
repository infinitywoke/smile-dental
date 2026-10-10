import { Suspense } from 'react'
import { connection } from 'next/server'
import { PublicBookingForm } from '@/components/site/PublicBookingForm'
import { getOpenSlots } from '@/lib/actions/booking'
import { todayInIndia } from '@/lib/dates'
import { confirmationPromise } from '@/lib/schedule'

export const metadata = {
  title: 'Book Appointment - Smile Dental Clinic',
}

// The free times come from the clinic's calendar at the moment the page is opened
async function BookingForm({ searchParams }: { searchParams: PageProps<'/book'>['searchParams'] }) {
  await connection()
  const { reason } = await searchParams
  const slots = await getOpenSlots()
  return (
    <PublicBookingForm
      slots={slots}
      promise={confirmationPromise(new Date())}
      today={todayInIndia()}
      initialReason={typeof reason === 'string' ? reason : ''}
    />
  )
}

export default function BookPage({ searchParams }: PageProps<'/book'>) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Book an Appointment</h1>
        <p className="mt-4 text-lg leading-8 text-gray-600">
          Pick a free time, tell us a little about you, and Dr. Rahil will confirm on WhatsApp.
        </p>
      </div>
      <Suspense fallback={<div className="py-16 text-center text-gray-500">Loading free times…</div>}>
        <BookingForm searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
