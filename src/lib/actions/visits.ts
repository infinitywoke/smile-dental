'use server'

import { RedirectType, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET } from '@/lib/data/visits'

type Result = { error?: string }
type NewPhoto = { path: string; caption: string }

// Saving purges every cached Clinic OS screen, so Back never shows stale data
function refreshClinicScreens() {
  revalidatePath('/app', 'layout')
}

// The visit id is generated on the phone, so a retry after a network error
// can't create a second visit: inserting the same id again counts as success.
export async function createVisit(visitId: string, patientId: string, notes: string): Promise<Result> {
  await getDoctor()
  const supabase = await createClient()
  const { error } = await supabase.from('visits').insert({ id: visitId, patient_id: patientId, notes: notes.trim() })
  if (error && error.code !== '23505') return { error: 'Could not save the visit. Please try again.' }
  refreshClinicScreens()
  return {}
}

// Records photos already uploaded to Storage. The path must sit in this doctor's folder for this visit.
async function insertPhotos(doctorId: string, visitId: string, photos: NewPhoto[]): Promise<Result> {
  if (photos.length === 0) return {}
  const prefix = `${doctorId}/${visitId}/`
  if (photos.some((p) => !p.path.startsWith(prefix))) return { error: 'Invalid photo.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('visit_photos')
    .insert(photos.map((p) => ({ visit_id: visitId, storage_path: p.path, caption: p.caption.trim() })))
  if (error && error.code !== '23505') return { error: 'Photos uploaded, but could not be attached to the visit. Please try again.' }
  return {}
}

// Used when some photos failed to upload: keeps the ones that worked without
// refreshing the screen, so the failed photos stay on screen for a retry.
export async function addVisitPhotos(visitId: string, photos: NewPhoto[]): Promise<Result> {
  const doctor = await getDoctor()
  return insertPhotos(doctor.id, visitId, photos)
}

// Final step of a save: attach photos, update notes (if changed), refresh once.
export async function saveVisitChanges(visitId: string, notes: string | null, photos: NewPhoto[]): Promise<Result> {
  const doctor = await getDoctor()
  const photoResult = await insertPhotos(doctor.id, visitId, photos)
  if (photoResult.error) return photoResult

  if (notes !== null) {
    const supabase = await createClient()
    const { error } = await supabase.from('visits').update({ notes: notes.trim() }).eq('id', visitId)
    if (error) return { error: 'Could not save the notes. Please try again.' }
  }
  refreshClinicScreens()
  return {}
}

export async function updatePhotoCaption(photoId: string, caption: string): Promise<Result> {
  await getDoctor()
  const supabase = await createClient()
  const { error } = await supabase.from('visit_photos').update({ caption: caption.trim() }).eq('id', photoId)
  if (error) return { error: 'Could not save the caption.' }
  refreshClinicScreens()
  return {}
}

export async function deleteVisitPhoto(photoId: string): Promise<Result> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase.from('visit_photos').delete().eq('id', photoId).select('storage_path').maybeSingle()
  if (error) return { error: 'Could not delete the photo.' }
  if (data) await supabase.storage.from(PHOTO_BUCKET).remove([data.storage_path])
  refreshClinicScreens()
  return {}
}

export async function deleteVisit(visitId: string): Promise<Result> {
  await getDoctor()
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
