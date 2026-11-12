import { getWebsiteTreatments } from '@/lib/data/price-list'
import { homeServicesFor } from '@/lib/price-list'
import { LiveBooking } from './LiveBooking'

export { BookingLoading, HowBooking } from './booking-parts'

// The booking card, with the price list's rows built into the page; its free times come from Clinic OS in the
// browser (LiveBooking), so the page needs nothing else on a visit and is built ahead wherever it is hosted
export async function Booking() {
  const list = await getWebsiteTreatments()
  return <LiveBooking services={homeServicesFor(list)} />
}
