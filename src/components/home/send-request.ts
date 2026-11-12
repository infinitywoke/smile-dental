import { siteConfig } from '@/config/site'
import { clinicOsOrigin } from './site-links'

// What the booking card sends: the visitor's answers, and the two signs of a bot
export type BookingInput = {
  name: string
  phone: string
  // Optional, in years (the database stores the birth year)
  age: string
  gender: string
  address: string
  medicalAlerts: string
  heardFrom: string
  reason: string
  notes: string
  requestedStart: string
  // 'call': no WhatsApp, the clinic calls to confirm
  contact: 'whatsapp' | 'call'
  // A field people never see (left empty by people), and a card answered in under a few seconds
  website: string
  tooFast: boolean
}

export type BookingResult = { ok: true; id: string } | { ok: false; error: string }

const FAILED = 'Sorry, we could not save your request. Please call or WhatsApp the clinic.'

// The request goes to Clinic OS's Booking API (src/app/api/v1), wherever this website is hosted: the clinic's
// phones hear about it from there, so the website itself holds no keys. The database re-checks every rule.
export async function sendBookingRequest({ website, tooFast, ...input }: BookingInput): Promise<BookingResult> {
  // A bot: answer as if saved, so it learns nothing, but send nothing
  if (website.trim() || tooFast) return { ok: true, id: crypto.randomUUID() }
  try {
    const response = await fetch(`${clinicOsOrigin()}/api/v1/clinics/${siteConfig.clinicSlug}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const answer = (await response.json().catch(() => null)) as { id?: string; error?: string } | null
    if (response.ok && answer?.id) return { ok: true, id: answer.id }
    return { ok: false, error: answer?.error || FAILED }
  } catch {
    // No connection, or Clinic OS out of reach
    return { ok: false, error: FAILED }
  }
}
