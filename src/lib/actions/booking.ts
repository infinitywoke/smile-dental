'use server'

import { headers } from 'next/headers'
import { createPublicClient } from '@/lib/supabase/public'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { isOnlineBookable, inIndia } from '@/lib/schedule'
import type { SubmitBookingRequestArgs } from '@/lib/data/types'

// Public: free appointment times for the website's booking page. Start times only, no names.
export async function getOpenSlots(): Promise<string[]> {
  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc('get_open_slots', { p_from: null, p_days: 28 })
  if (error || !data) return []
  return (data as { slot_start: string }[]).map((row) => new Date(row.slot_start).toISOString())
}

export type BookingInput = {
  name: string
  phone: string
  dateOfBirth: string
  address: string
  medicalAlerts: string
  heardFrom: string
  reason: string
  notes: string
  requestedStart: string
}

export type BookingResult = { ok: true; id: string } | { ok: false; error: string }

// Public: saves the request. The database re-checks every rule (free block, 2 hours' notice,
// before 7 PM, limits per phone and device), so nothing here is trusted.
export async function submitBookingRequest(input: BookingInput): Promise<BookingResult> {
  const phone = normalizePhone(input.phone)
  if (!isValidPhone(phone)) return { ok: false, error: 'Please enter a valid 10-digit mobile number.' }
  if (input.name.trim().length < 2) return { ok: false, error: 'Please enter your name.' }

  const start = new Date(input.requestedStart)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Please choose a time.' }
  const { date, time } = inIndia(start)
  if (!isOnlineBookable(date, time, new Date())) {
    return { ok: false, error: 'That time is no longer available. Please choose another.' }
  }

  // The first address in X-Forwarded-For is the visitor
  const forwarded = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const supabase = createPublicClient(forwarded)

  const args: SubmitBookingRequestArgs = {
    p_name: input.name.trim(),
    p_phone: phone!,
    p_date_of_birth: input.dateOfBirth || null,
    p_address: input.address.trim() || null,
    p_medical_alerts: input.medicalAlerts.trim() || null,
    p_heard_from: input.heardFrom.trim() || null,
    p_reason: input.reason.trim() || null,
    p_notes: input.notes.trim() || null,
    p_requested_start: start.toISOString(),
  }
  const { data, error } = await supabase.rpc('submit_booking_request', args)
  if (error || !data) {
    // The database writes its messages for visitors; anything else gets a generic line
    const known = error?.code === 'P0001' && error.message
    return { ok: false, error: known ? error.message : 'Sorry, we could not save your request. Please call or WhatsApp the clinic.' }
  }
  return { ok: true, id: String(data) }
}
