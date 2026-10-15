'use server'

import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getDaySchedule } from '@/lib/data/appointments'
import { formatPrice } from '@/lib/pricing'
import { addDays, isClosedDay } from '@/lib/schedule'
import { todayInIndia } from '@/lib/dates'
import { notesText, sortVisitRecording } from '@/lib/smart-notes'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// About 10 minutes at the recorder's quality, well inside what the server accepts
const MAX_BYTES = 4 * 1024 * 1024

export type NoteSuggestions = {
  // The sorted notes, ready to add to the notes box
  notes: string
  // Price-list items for treatment he said was done; the price is the clinic's own (none for a range)
  charges: { key: string; description: string; treatmentSlug: string; amount: number | null; priceText: string; why: string }[]
  // A next visit he mentioned: the first free time that fits, on that day or the next open days
  nextVisit: { instant: string | null; minutes: number; why: string } | null
}

// Sends the visit's recording to Gemini (nothing else about the patient) and turns its answer into
// notes and suggestions. Nothing is saved or booked here: the doctor taps what he wants.
export async function sortVisitNotes(formData: FormData): Promise<{ error?: string; result?: NoteSuggestions }> {
  await getDoctor()
  const visitId = String(formData.get('visitId') ?? '')
  const audio = formData.get('audio')
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  if (!(audio instanceof Blob) || audio.size === 0) return { error: 'The recording is empty. Please record again.' }
  if (audio.size > MAX_BYTES) return { error: 'The recording is too long. Please keep it under 10 minutes.' }
  if (!audio.type.startsWith('audio/')) return { error: 'That is not a recording.' }

  const supabase = await createClient()
  const { data: visit } = await supabase.from('visits').select('id').eq('id', visitId).maybeSingle()
  if (!visit) return { error: 'That visit was not found.' }

  let sorted
  try {
    sorted = await sortVisitRecording(audio)
  } catch (e) {
    return { error: `Couldn't sort the notes (${e instanceof Error ? e.message : 'no answer'}). Your recording is kept: tap Try again.` }
  }

  const charges = sorted.charges.map((c) => ({
    key: c.id,
    description: `${c.option.detail ? `${c.option.treatment} – ${c.option.detail}` : c.option.treatment}${c.teeth ? ` (${c.teeth})` : ''}`,
    treatmentSlug: c.option.slug,
    amount: c.option.price.kind === 'fixed' ? c.option.price.amount : null,
    priceText: formatPrice(c.option.price),
    why: c.why,
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

  return { result: { notes: notesText(sorted), charges, nextVisit } }
}
