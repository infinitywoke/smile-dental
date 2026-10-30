'use server'

import { headers } from 'next/headers'
import { after } from 'next/server'
import { siteConfig } from '@/config/site'
import { createPublicClient } from '@/lib/supabase/public'
import { notifyNewRequest } from '@/lib/push'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { isOnlineBookable, inIndia } from '@/lib/schedule'
import type { SubmitBookingRequestArgs } from '@/lib/data/types'
import { parseGender } from '@/lib/gender'
import { birthYearFromAge, parseAge, titleCaseName } from '@/lib/patient-fields'
import { CALL_BACK_NOTE } from '@/lib/booking-contact'

// Public: free appointment times for the website's booking page. Start times only, no names.
export async function getOpenSlots(): Promise<string[]> {
  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc('get_open_slots', { p_clinic: siteConfig.clinicSlug, p_from: null, p_days: 28 })
  if (error || !data) return []
  return (data as { slot_start: string }[]).map((row) => new Date(row.slot_start).toISOString())
}

// Public: whether a clinic's online booking is paused (the website asks for its own, Clinic OS for the
// signed-in clinic's), and until when ("infinity": until the dentist turns it back on). `ready` is false until supabase/pause-booking-2026-10.sql has been run; booking then counts as open.
export async function getBookingPause(clinicSlug: string): Promise<{ ready: boolean; until: string | null }> {
  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc('booking_paused_until', { p_clinic: clinicSlug })
  if (error) return { ready: false, until: null }
  return { ready: true, until: (data as string | null) ?? null }
}

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
  // Bot traps: a field people never see (left empty by people), and a form sent in under a few seconds
  website: string
  tooFast: boolean
}

export type BookingResult = { ok: true; id: string } | { ok: false; error: string }

// Public: saves the request. The database re-checks every rule (free block, not started yet,
// before 7 PM, limits per phone and device), so nothing here is trusted.
export async function submitBookingRequest(input: BookingInput): Promise<BookingResult> {
  // A bot: answer as if saved, so it learns nothing, but save nothing
  if (input.website.trim() || input.tooFast) return { ok: true, id: crypto.randomUUID() }
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

  // The first address in X-Forwarded-For is the visitor
  const forwarded = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const supabase = createPublicClient(forwarded)

  const args: SubmitBookingRequestArgs = {
    p_clinic: siteConfig.clinicSlug,
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
  const { data, error } = await supabase.rpc('submit_booking_request', args)
  if (error || !data) {
    // The database writes its messages for visitors; anything else gets a generic line
    const known = error?.code === 'P0001' ? error.message : null
    return { ok: false, error: known || 'Sorry, we could not save your request. Please call or WhatsApp the clinic.' }
  }
  // The dentist's phones hear about it once the visitor has their answer
  const id = String(data)
  after(() => notifyNewRequest(id))
  return { ok: true, id }
}

// Which way the visitor was asked to describe their problem (the voice note test), and for the page
// version the recording itself. Uploaded with the public key: the database lets a just-made request
// (15 minutes) attach one audio file of at most 1 MB, and only the clinic can play it.
const VOICE_TYPES: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function attachVoiceNote(formData: FormData): Promise<{ ok: boolean }> {
  const requestId = String(formData.get('requestId') ?? '')
  const variant = String(formData.get('variant') ?? '')
  const note = formData.get('note')
  if (!UUID.test(requestId) || (variant !== 'page' && variant !== 'whatsapp')) return { ok: false }

  const supabase = createPublicClient()
  let path: string | null = null
  if (variant === 'page' && note instanceof Blob && note.size > 0) {
    const type = note.type.split(';')[0]
    const extension = VOICE_TYPES[type]
    if (!extension || note.size > 1024 * 1024) return { ok: false }
    path = `${requestId}.${extension}`
    const { error } = await supabase.storage.from('request-voice').upload(path, note, { contentType: type })
    // "Already exists": an earlier try uploaded it
    if (error && !/exist/i.test(error.message)) return { ok: false }
  }
  const { error } = await supabase.rpc('set_request_voice', { p_request: requestId, p_variant: variant, p_path: path })
  return { ok: !error }
}
