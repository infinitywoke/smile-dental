'use server'

import { RedirectType, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET, findOrCreateTodaysVisit } from '@/lib/data/visits'
import { getNextVisitSuggestion } from '@/lib/data/next-visit'
import { todayInIndia } from '@/lib/dates'
import { BLOCK_MINUTES, clinicBlockOf } from '@/lib/schedule'
import { PHOTO_KINDS, type PhotoKind } from '@/lib/visit-status'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_NOTES = 20_000

type Result = { error?: string }

// Saving purges every cached Clinic OS screen, so Back never shows stale data
function refreshClinicScreens() {
  revalidatePath('/app', 'layout')
}

// "Start visit": opens today's visit for the patient, creating it only if there is none yet.
// The id comes from the phone, so pressing twice never makes two visits.
export async function startVisit(patientId: string, visitId: string, appointmentId?: string): Promise<Result> {
  await getDoctor()
  const id = await findOrCreateTodaysVisit(patientId, { visitId, appointmentId })
  if (!id) return { error: 'Could not start the visit. Please try again.' }
  refreshClinicScreens()
  redirect(`/app/visits/${id}`, RedirectType.push)
}

// Notes save by themselves while the doctor types or dictates
export async function saveVisitNotes(visitId: string, notes: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  const supabase = await createClient()
  const { error } = await supabase.from('visits').update({ notes: notes.slice(0, MAX_NOTES) }).eq('id', visitId)
  if (error) return { error: 'Could not save the notes.' }
  refreshClinicScreens()
  return {}
}

// Records a photo the phone has just uploaded. The path must sit in this doctor's folder for this
// visit; a retry of the same photo is ignored (the path is unique).
export async function addVisitPhoto(visitId: string, path: string): Promise<Result> {
  const doctor = await getDoctor()
  if (!UUID.test(visitId) || !path.startsWith(`${doctor.id}/${visitId}/`)) return { error: 'Invalid photo.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('visit_photos')
    .upsert({ visit_id: visitId, storage_path: path, caption: '' }, { onConflict: 'storage_path', ignoreDuplicates: true })
  if (error) return { error: 'The photo uploaded, but could not be added to the visit.' }
  refreshClinicScreens()
  return {}
}

// One tap under a photo: Prescription, X-ray or Other (stored as the caption)
export async function setPhotoKind(photoId: string, kind: PhotoKind): Promise<Result> {
  await getDoctor()
  if (!UUID.test(photoId) || !PHOTO_KINDS.includes(kind)) return { error: 'Invalid photo.' }
  const supabase = await createClient()
  const { error } = await supabase.from('visit_photos').update({ caption: kind }).eq('id', photoId)
  if (error) return { error: 'Could not save that. Please try again.' }
  refreshClinicScreens()
  return {}
}

export async function deleteVisitPhoto(photoId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(photoId)) return { error: 'Invalid photo.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('visit_photos').delete().eq('id', photoId).select('storage_path').maybeSingle()
  if (error) return { error: 'Could not delete the photo.' }
  if (data) await supabase.storage.from(PHOTO_BUCKET).remove([data.storage_path])
  refreshClinicScreens()
  return {}
}

// The suggested next visit, asked for by the visit page only when it shows the choice
export async function suggestNextVisit(visitId: string): Promise<string | null> {
  await getDoctor()
  if (!UUID.test(visitId)) return null
  return getNextVisitSuggestion(visitId)
}

// Books the next visit, only when the doctor taps a time. Choosing again moves the same booking.
export async function bookNextVisit(visitId: string, startsAt: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  const block = clinicBlockOf(startsAt)
  if (!block) return { error: 'Please choose one of the clinic time blocks.' }
  if (block.date < todayInIndia()) return { error: 'That time has already passed.' }

  const supabase = await createClient()
  const { data: visit } = await supabase.from('visits').select('patient_id').eq('id', visitId).maybeSingle()
  if (!visit) return { error: 'That visit was not found.' }

  const { data: existing } = await supabase
    .from('appointments')
    .select('id')
    .eq('from_visit_id', visitId)
    .eq('status', 'booked')
    .maybeSingle()
  const write = existing
    ? supabase.from('appointments').update({ starts_at: block.iso, duration_min: BLOCK_MINUTES }).eq('id', existing.id)
    : supabase.from('appointments').insert({
        patient_id: visit.patient_id,
        starts_at: block.iso,
        duration_min: BLOCK_MINUTES,
        reason: 'Follow-up',
        status: 'booked',
        from_visit_id: visitId,
      })
  const { error } = await write
  if (error) {
    return { error: error.code === '23P01' ? 'That time was just taken. Please choose another.' : 'Could not book the next visit. Please try again.' }
  }
  refreshClinicScreens()
  return {}
}

// Called as WhatsApp opens with the visit message: the visit now shows "WhatsApp sent"
// (closed_at keeps the first time), and today's appointment for it counts as done.
export async function markWhatsappSent(visitId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  const supabase = await createClient()
  const { error } = await supabase.from('visits').update({ closed_at: new Date().toISOString() }).eq('id', visitId).is('closed_at', null)
  if (error) return { error: 'Could not record the message.' }
  await supabase.from('appointments').update({ status: 'done' }).eq('visit_id', visitId).eq('status', 'booked')
  refreshClinicScreens()
  return {}
}

export async function deleteVisit(visitId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  const supabase = await createClient()
  // Find the photo files first; if that fails, stop rather than leave orphaned patient images in Storage
  const { data: photos, error: photosError } = await supabase.from('visit_photos').select('storage_path').eq('visit_id', visitId)
  if (photosError) return { error: 'Could not delete the visit.' }

  const { data, error } = await supabase.from('visits').delete().eq('id', visitId).select('patient_id').maybeSingle()
  if (error || !data) return { error: 'Could not delete the visit.' }
  if (photos.length > 0) {
    await supabase.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.storage_path))
  }
  refreshClinicScreens()
  // Replace, so Back doesn't return to the deleted visit
  redirect(`/app/patients/${data.patient_id}`, RedirectType.replace)
}
