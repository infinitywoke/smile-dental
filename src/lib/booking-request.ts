import 'server-only'
import { after } from 'next/server'
import { CALL_BACK_NOTE } from '@/lib/booking-contact'
import type { SubmitBookingRequestArgs } from '@/lib/data/types'
import { parseGender } from '@/lib/gender'
import { birthYearFromAge, parseAge, titleCaseName } from '@/lib/patient-fields'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { notifyNewRequest } from '@/lib/push'
import { inIndia, isOnlineBookable } from '@/lib/schedule'
import { createPublicClient } from '@/lib/supabase/public'

export type RequestInput = {
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
}

export type RequestResult = { ok: true; id: string } | { ok: false; error: string }

// Saves a website's request into a clinic: the Booking API's, where every clinic's website sends its requests
// (src/components/home/send-request.ts). The database re-checks every rule (free block, not started yet, before
// 7 PM, limits per phone and device), so nothing here is trusted. `visitorIp` is what those limits count.
export async function saveBookingRequest(clinicSlug: string, input: RequestInput, visitorIp: string | null): Promise<RequestResult> {
  const phone = normalizePhone(input.phone)
  if (!isValidPhone(phone)) return { ok: false, error: 'Please enter a valid 10-digit mobile number.' }
  if (input.name.trim().length < 2) return { ok: false, error: 'Please enter your name.' }
  // The new homepage doesn't ask (the clinic adds it at the visit); the /book form still does
  const gender = input.gender.trim() ? parseGender(input.gender) : null
  if (input.gender.trim() && !gender) return { ok: false, error: 'Please choose female, male or other.' }

  let birthYear: number | null = null
  if (input.age.trim()) {
    const age = parseAge(input.age)
    if (age === null) return { ok: false, error: 'Please check the age.' }
    birthYear = birthYearFromAge(age, inIndia(new Date()).date)
  }

  const start = new Date(input.requestedStart)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Please choose a time.' }
  const { date, time } = inIndia(start)
  if (!isOnlineBookable(date, time, new Date())) {
    return { ok: false, error: 'That time is no longer available. Please choose another.' }
  }

  const args: SubmitBookingRequestArgs = {
    p_clinic: clinicSlug,
    p_name: titleCaseName(input.name),
    p_phone: phone!,
    p_birth_year: birthYear,
    p_address: input.address.trim() || null,
    p_medical_alerts: input.medicalAlerts.trim() || null,
    p_heard_from: input.heardFrom.trim() || null,
    p_reason: input.reason.trim() || null,
    p_notes: [input.contact === 'call' ? CALL_BACK_NOTE : '', input.notes.trim()].filter(Boolean).join('\n') || null,
    p_requested_start: start.toISOString(),
    p_gender: gender,
  }
  const { data, error } = await createPublicClient(visitorIp).rpc('submit_booking_request', args)
  if (error || !data) {
    // The database writes its messages for visitors; anything else gets a generic line
    const known = error?.code === 'P0001' ? error.message : null
    return { ok: false, error: known || 'Sorry, we could not save your request. Please call or WhatsApp the clinic.' }
  }
  // The clinic's phones hear about it once the visitor has their answer
  const id = String(data)
  after(() => notifyNewRequest(id))
  return { ok: true, id }
}
