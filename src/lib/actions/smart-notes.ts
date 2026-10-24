'use server'

import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getDaySchedule } from '@/lib/data/appointments'
import { formatPrice } from '@/lib/pricing'
import { addDays, isClosedDay } from '@/lib/schedule'
import { todayInIndia } from '@/lib/dates'
import { notesText, sortVisitRecording } from '@/lib/smart-notes'
import { medicineNames } from '@/lib/prescription'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// About 10 minutes at the recorder's quality, well inside what the server accepts
const MAX_BYTES = 4 * 1024 * 1024

export type NoteSuggestions = {
  // The sorted notes, ready to add to the notes box
  notes: string
  // Price-list items for treatment he said was done; the price is the clinic's own (none for a range).
  // "guess": Gemini wasn't sure which option he meant.
  charges: { key: string; description: string; treatmentSlug: string; amount: number | null; priceText: string; why: string; guess: boolean }[]
  // Treatment done today that is not on the price list: added as another charge, with an amount
  notOnList: string[]
  // What Gemini couldn't make out: he corrects the notes
  unclear: string[]
  // A next visit he mentioned: the first free time that fits, on that day or the next open days
  nextVisit: { instant: string | null; minutes: number; why: string } | null
}

const EXTENSIONS: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/wav': 'wav' }
const AUDIO_BUCKET = 'visit-audio'

// The visit's recording is kept by the clinic (private, under <doctor>/<visit>/), then sent to Gemini
// (nothing else about the patient). A retry sorts the kept recording again. Nothing is saved to the
// notes or booked here: the doctor taps what he wants.
export async function sortVisitNotes(formData: FormData): Promise<{ error?: string; recordingId?: string; result?: NoteSuggestions }> {
  const doctor = await getDoctor()
  const visitId = String(formData.get('visitId') ?? '')
  const keptId = String(formData.get('recordingId') ?? '')
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  const supabase = await createClient()
  const { data: visit } = await supabase.from('visits').select('id').eq('id', visitId).maybeSingle()
  if (!visit) return { error: 'That visit was not found.' }

  let audio: Blob
  let recordingId: string
  if (UUID.test(keptId)) {
    // Try again: the recording the clinic already keeps
    const { data: row } = await supabase.from('visit_recordings').select('id, storage_path').eq('id', keptId).eq('visit_id', visitId).maybeSingle()
    if (!row) return { error: 'That recording was not found. Please record again.' }
    const { data: file, error } = await supabase.storage.from(AUDIO_BUCKET).download(row.storage_path)
    if (error || !file) return { error: "Couldn't open the recording. Please try again.", recordingId: row.id }
    audio = file
    recordingId = row.id
  } else {
    const file = formData.get('audio')
    if (!(file instanceof Blob) || file.size === 0) return { error: 'The recording is empty. Please record again.' }
    if (file.size > MAX_BYTES) return { error: 'The recording is too long. Please keep it under 10 minutes.' }
    const type = file.type.split(';')[0]
    const extension = EXTENSIONS[type]
    if (!extension) return { error: 'That is not a recording.' }
    const seconds = Math.max(0, Math.min(3600, Math.round(Number(formData.get('seconds')) || 0)))
    recordingId = crypto.randomUUID()
    const path = `${doctor.id}/${visitId}/${recordingId}.${extension}`
    const { error: uploadError } = await supabase.storage.from(AUDIO_BUCKET).upload(path, file, { contentType: type })
    if (uploadError && !/exist/i.test(uploadError.message)) return { error: "Couldn't save the recording. Check the internet and try again." }
    const { error: rowError } = await supabase.from('visit_recordings').insert({ id: recordingId, visit_id: visitId, storage_path: path, seconds })
    if (rowError) {
      await supabase.storage.from(AUDIO_BUCKET).remove([path])
      return { error: "Couldn't save the recording. Please try again." }
    }
    audio = new Blob([await file.arrayBuffer()], { type })
    revalidatePath(`/app/visits/${visitId}`)
  }

  // The medicines he has prescribed before (names only), so the notes spell them as he does
  const { data: past } = await supabase
    .from('visits').select('notes').or('notes.ilike.%prescription:%,notes.ilike.%rx:%').order('created_at', { ascending: false }).limit(300)
  const medicines = medicineNames((past ?? []).map((v) => v.notes ?? ''))

  let sorted
  try {
    sorted = await sortVisitRecording(audio, medicines)
  } catch (e) {
    return { recordingId, error: `Couldn't sort the notes (${e instanceof Error ? e.message : 'no answer'}). The recording is saved: tap Try again.` }
  }

  const charges = sorted.charges.map((c) => ({
    key: c.id,
    description: `${c.option.detail ? `${c.option.treatment} – ${c.option.detail}` : c.option.treatment}${c.teeth ? ` (${c.teeth})` : ''}`,
    treatmentSlug: c.option.slug,
    amount: c.option.price.kind === 'fixed' ? c.option.price.amount : null,
    priceText: formatPrice(c.option.price),
    why: c.why,
    guess: c.guess,
  }))

  let nextVisit: NoteSuggestions['nextVisit'] = null
  if (sorted.nextVisit) {
    const { inDays, minutes, why } = sorted.nextVisit
    let instant: string | null = null
    const target = addDays(todayInIndia(), inDays)
    for (let d = 0; d < 7 && !instant; d++) {
      const date = addDays(target, d)
      if (isClosedDay(date)) continue
      const schedule = await getDaySchedule(date, minutes)
      if (schedule.dayOff) continue
      instant = schedule.blocks.find((b) => b.state === 'free')?.instant ?? null
    }
    nextVisit = { instant, minutes, why }
  }

  return { recordingId, result: { notes: notesText(sorted), charges, notOnList: sorted.notOnList, unclear: sorted.unclear, nextVisit } }
}
