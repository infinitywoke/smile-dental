import { PublicBookingForm } from '@/components/site/PublicBookingForm'

export const metadata = {
  title: 'Book Appointment - Smile Dental Clinic',
}

export default function BookPage() {
  return (
    <div className="bg-gray-50 py-12 px-4 sm:px-6 min-h-screen">
      <div className="max-w-2xl mx-auto text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Request an Appointment</h1>
        <p className="mt-4 text-lg leading-8 text-gray-600">
          Fill out the form below and our team will get back to you shortly to confirm your booking.
        </p>
      </div>
      <PublicBookingForm />
    </div>
  )
}
