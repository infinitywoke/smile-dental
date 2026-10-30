'use server'

import { headers } from 'next/headers'
import { siteConfig } from '@/config/site'
import { openSlots, saveBookingRequest, type RequestInput, type RequestResult } from '@/lib/booking-request'
import { createPublicClient } from '@/lib/supabase/public'

// Public: free appointment times for the website's booking page. Start times only, no names.
export const getOpenSlots = async (): Promise<string[]> => openSlots(siteConfig.clinicSlug)

// Public: whether a clinic's online booking is paused (the website asks for its own, Clinic OS for the
// signed-in clinic's), and until when ("infinity": until the dentist turns it back on). `ready` is false until supabase/pause-booking-2026-10.sql has been run; booking then counts as open.
export async function getBookingPause(clinicSlug: string): Promise<{ ready: boolean; until: string | null }> {
  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc('booking_paused_until', { p_clinic: clinicSlug })
  if (error) return { ready: false, until: null }
  return { ready: true, until: (data as string | null) ?? null }
}

export type BookingInput = RequestInput & {
  // Bot traps: a field people never see (left empty by people), and a form sent in under a few seconds
  website: string
  tooFast: boolean
}

export type BookingResult = RequestResult

// Public: saves the request into this website's clinic
export async function submitBookingRequest(input: BookingInput): Promise<BookingResult> {
  // A bot: answer as if saved, so it learns nothing, but save nothing
  if (input.website.trim() || input.tooFast) return { ok: true, id: crypto.randomUUID() }
  // The first address in X-Forwarded-For is the visitor
  const forwarded = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null
  return saveBookingRequest(siteConfig.clinicSlug, input, forwarded)
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
