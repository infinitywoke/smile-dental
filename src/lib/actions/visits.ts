'use server'

import { RedirectType, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET } from '@/lib/data/visits'
import { getVisitBill } from '@/lib/data/billing'
import { todayInIndia } from '@/lib/dates'
import { BLOCK_MINUTES, clinicBlockOf } from '@/lib/schedule'
import { visitMessage } from '@/lib/billing'
import { whatsappLink } from '@/lib/whatsapp'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Result = { error?: string }
type NewPhoto = { path: string; caption: string }

// Saving purges every cached Clinic OS screen, so Back never shows stale data
function refreshClinicScreens() {
  revalidatePath('/app', 'layout')
}

// The visit id is generated on the phone, so a retry after a network error
// can't create a second visit: inserting the same id again counts as success.
export async function createVisit(
  visitId: string,
  patientId: string,
  notes: string,
  appointmentId?: string,
): Promise<Result> {
  await getDoctor()
  const supabase = await createClient()
  const { error } = await supabase.from('visits').insert({ id: visitId, patient_id: patientId, notes: notes.trim() })
  if (error && error.code !== '23505') return { error: 'Could not save the visit. Please try again.' }

  if (appointmentId && UUID.test(appointmentId)) {
    await supabase.from('appointments').update({ visit_id: visitId }).eq('id', appointmentId).eq('patient_id', patientId)
  } else {
    // Check if patient has a booked appointment today
    const today = todayInIndia()
    const { data: appt } = await supabase
      .from('appointments')
      .select('id')
      .eq('patient_id', patientId)
      .eq('status', 'booked')
      .gte('starts_at', `${today}T00:00:00+05:30`)
      .lte('starts_at', `${today}T23:59:59+05:30`)
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (appt) {
      await supabase.from('appointments').update({ visit_id: visitId }).eq('id', appt.id)
    }
  }

  refreshClinicScreens()
  return {}
}

// Photo links that go to a patient last 30 days; the short links used on screen are never shared
const SHARE_LINK_SECONDS = 60 * 60 * 24 * 30

// Finishing a visit, in one safe step: book the next visit (if one was chosen), make the prescription
// links, mark the visit done (and its appointment), and prepare the one WhatsApp message.
// Nothing is closed if the next visit can't be booked, so the doctor can pick another time.
export async function completeVisit(
  visitId: string,
  options: { nextStartsAt: string | null; photoIds: string[]; send: boolean },
): Promise<Result & { whatsappUrl?: string }> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  if (options.photoIds.length > 10 || options.photoIds.some((id) => !UUID.test(id))) return { error: 'Invalid photo.' }

  const bill = await getVisitBill(visitId)
  const supabase = await createClient()
  const patientId = bill.patient.id

  // 1. The next visit
  let nextStartsAt: string | null = null
  if (options.nextStartsAt) {
    const block = clinicBlockOf(options.nextStartsAt)
    if (!block) return { error: 'Please choose one of the clinic time blocks.' }
    if (block.date < todayInIndia()) return { error: 'That time has already passed.' }

    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('from_visit_id', visitId)
      .eq('status', 'booked')
      .maybeSingle()
    const write = existing
      ? supabase.from('appointments').update({ starts_at: block.iso, duration_min: BLOCK_MINUTES }).eq('id', existing.id)
      : supabase.from('appointments').insert({
          patient_id: patientId,
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
    nextStartsAt = block.iso
  } else {
    // No new booking: if the patient already has one coming up, the message mentions it
    const { data: upcoming } = await supabase
      .from('appointments')
      .select('starts_at')
      .eq('patient_id', patientId)
      .eq('status', 'booked')
      .gt('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    nextStartsAt = upcoming?.starts_at ?? null
  }

  // 2. Photo links (only for the photos of this visit)
  let photoUrls: string[] = []
  if (options.send && options.photoIds.length > 0) {
    const { data: photos, error } = await supabase
      .from('visit_photos')
      .select('storage_path, created_at')
      .eq('visit_id', visitId)
      .in('id', options.photoIds)
      .order('created_at')
    if (error) return { error: 'Could not prepare the prescription link. Please try again.' }
    if (photos.length > 0) {
      const { data: signed, error: signError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(photos.map((p) => p.storage_path), SHARE_LINK_SECONDS)
      if (signError || !signed) return { error: 'Could not prepare the prescription link. Please try again.' }
      photoUrls = signed.flatMap((item) => (item.signedUrl ? [item.signedUrl] : []))
    }
  }

  // 3. Mark the visit done (keeping the first finish time) and its appointment
  const { error: closeError } = await supabase
    .from('visits')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', visitId)
    .is('closed_at', null)
  if (closeError) return { error: 'Could not finish the visit. Please try again.' }
  await supabase.from('appointments').update({ status: 'done' }).eq('visit_id', visitId).eq('status', 'booked')

  refreshClinicScreens()

  // 4. The one message
  if (!options.send || !bill.patient.phone) return {}
  const text = visitMessage({
    patientName: bill.patient.name,
    visitDate: bill.visit.visit_date,
    lines: bill.charges,
    payments: bill.payments,
    summary: bill.summary,
    nextAppointment: nextStartsAt ? { starts_at: nextStartsAt } : null,
    prescriptionPhotoUrls: photoUrls,
  })
  return { whatsappUrl: whatsappLink(bill.patient.phone, text) }
}

export async function reopenVisit(visitId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  const supabase = await createClient()
  const { error } = await supabase.from('visits').update({ closed_at: null }).eq('id', visitId)
  if (error) return { error: 'Could not reopen the visit. Please try again.' }

  refreshClinicScreens()
  return {}
}

// Records photos already uploaded to Storage. The path must sit in this doctor's folder for this visit.
async function insertPhotos(doctorId: string, visitId: string, photos: NewPhoto[]): Promise<Result> {
  if (photos.length === 0) return {}
  const prefix = `${doctorId}/${visitId}/`
  if (photos.some((p) => !p.path.startsWith(prefix))) return { error: 'Invalid photo.' }

  const supabase = await createClient()
  // A retry may re-send photos that were already recorded: skip those rows, keep the new ones
  const { error } = await supabase
    .from('visit_photos')
    .upsert(photos.map((p) => ({ visit_id: visitId, storage_path: p.path, caption: p.caption.trim() })), {
      onConflict: 'storage_path',
      ignoreDuplicates: true,
    })
  if (error) return { error: 'Photos uploaded, but could not be attached to the visit. Please try again.' }
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
