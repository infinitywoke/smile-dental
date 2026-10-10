'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET } from '@/lib/data/visits'

type Result = { error?: string }

export async function createVisit(patientId: string, notes: string): Promise<Result & { visitId?: string }> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visits')
    .insert({ patient_id: patientId, notes: notes.trim() })
    .select('id')
    .single()
  if (error) return { error: 'Could not save the visit. Please try again.' }
  return { visitId: data.id }
}

export async function updateVisitNotes(visitId: string, notes: string): Promise<Result> {
  await getDoctor()
  const supabase = await createClient()
  const { error } = await supabase.from('visits').update({ notes: notes.trim() }).eq('id', visitId)
  if (error) return { error: 'Could not save the notes. Please try again.' }
  refresh()
  return {}
}

// Photos are uploaded from the phone straight to Storage; this records them.
export async function addVisitPhotos(visitId: string, photos: { path: string; caption: string }[]): Promise<Result> {
  const doctor = await getDoctor()
  const prefix = `${doctor.id}/${visitId}/`
  if (photos.some((p) => !p.path.startsWith(prefix))) return { error: 'Invalid photo.' }
  if (photos.length === 0) return {}

  const supabase = await createClient()
  const { error } = await supabase
    .from('visit_photos')
    .insert(photos.map((p) => ({ visit_id: visitId, storage_path: p.path, caption: p.caption.trim() })))
  if (error) return { error: 'Photos uploaded, but could not be attached to the visit. Please try again.' }
  refresh()
  return {}
}

export async function updatePhotoCaption(photoId: string, caption: string): Promise<Result> {
  await getDoctor()
  const supabase = await createClient()
  const { error } = await supabase.from('visit_photos').update({ caption: caption.trim() }).eq('id', photoId)
  if (error) return { error: 'Could not save the caption.' }
  refresh()
  return {}
}

export async function deleteVisitPhoto(photoId: string): Promise<Result> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase.from('visit_photos').delete().eq('id', photoId).select('storage_path').maybeSingle()
  if (error) return { error: 'Could not delete the photo.' }
  if (data) await supabase.storage.from(PHOTO_BUCKET).remove([data.storage_path])
  refresh()
  return {}
}

export async function deleteVisit(visitId: string): Promise<Result> {
  await getDoctor()
  const supabase = await createClient()
  const { data: photos } = await supabase.from('visit_photos').select('storage_path').eq('visit_id', visitId)
  const { data, error } = await supabase.from('visits').delete().eq('id', visitId).select('patient_id').maybeSingle()
  if (error || !data) return { error: 'Could not delete the visit.' }
  if (photos && photos.length > 0) {
    await supabase.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.storage_path))
  }
  redirect(`/app/patients/${data.patient_id}`)
}
