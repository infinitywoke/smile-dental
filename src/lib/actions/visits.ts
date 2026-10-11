'use server'

import { RedirectType, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET, SHARE_LINK_SECONDS, appointmentsOfVisit, findOrCreateTodaysVisit, indiaDayBounds } from '@/lib/data/visits'
import { getVisitBill, type VisitBill } from '@/lib/data/billing'
import { getNextVisitSuggestion } from '@/lib/data/next-visit'
import { MAX_PHOTOS_TO_SEND } from '@/lib/billing'
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

// Notes save by themselves while the doctor types or dictates. Most saves don't refresh any screen
// (the visit page already shows what was typed); `refresh` is asked for when other screens need the
// change: the first note on an empty visit (it starts being listed) and when the doctor leaves the page.
export async function saveVisitNotes(visitId: string, notes: string, options: { refresh?: boolean } = {}): Promise<Result> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  const supabase = await createClient()
  const { error } = await supabase.from('visits').update({ notes: notes.slice(0, MAX_NOTES) }).eq('id', visitId)
  if (error) return { error: 'Could not save the notes.' }
  if (options.refresh) refreshClinicScreens()
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

// What the WhatsApp message says, read fresh from the database at the tap
export type MessageData = {
  charges: VisitBill['charges']
  payments: VisitBill['payments']
  summary: VisitBill['summary']
  nextAppointment: { starts_at: string } | null
  // 30-day links for the ticked photos, by photo id
  links: Record<string, string>
}

// The doctor tapped Send on WhatsApp. Reads the bill and the next appointment fresh (server actions
// run one after another, so a booking, charge or payment tapped just before is already saved), makes
// the 30-day links for the ticked photos (only now, and only photos of this visit), then records the
// visit as "WhatsApp sent" (closed_at keeps the first time) and today's appointment for it as done.
// A visit dated today also marks the patient's other bookings today as done, so a second booking
// on the same day never stays "booked" for ever.
export async function markWhatsappSent(visitId: string, photoIds: string[] = []): Promise<Result & { message?: MessageData }> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  if (photoIds.length > MAX_PHOTOS_TO_SEND) return { error: `You can send up to ${MAX_PHOTOS_TO_SEND} photos at a time.` }
  if (photoIds.some((id) => !UUID.test(id))) return { error: 'Invalid photo.' }
  const supabase = await createClient()

  let fresh: Omit<MessageData, 'links'>
  let visitInfo: { patientId: string; date: string }
  try {
    const bill = await getVisitBill(visitId)
    visitInfo = { patientId: bill.patient.id, date: bill.visit.visit_date }
    const { next } = await appointmentsOfVisit(visitId, bill.patient.id)
    fresh = {
      charges: bill.charges,
      payments: bill.payments,
      summary: bill.summary,
      nextAppointment: next ? { starts_at: next.starts_at } : null,
    }
  } catch {
    return { error: 'Could not prepare the message. Please try again.' }
  }

  const links: Record<string, string> = {}
  if (photoIds.length > 0) {
    const { data: photos, error } = await supabase.from('visit_photos').select('id, storage_path').eq('visit_id', visitId).in('id', photoIds)
    if (error || photos.length !== new Set(photoIds).size) return { error: 'Could not prepare the photo links. Please try again.' }
    const { data: signed, error: signError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(photos.map((p) => p.storage_path), SHARE_LINK_SECONDS)
    if (signError || !signed) return { error: 'Could not prepare the photo links. Please try again.' }
    const idByPath = new Map(photos.map((p) => [p.storage_path, p.id]))
    for (const item of signed) {
      const id = item.path ? idByPath.get(item.path) : undefined
      if (id && item.signedUrl) links[id] = item.signedUrl
    }
    if (Object.keys(links).length !== photos.length) return { error: 'Could not prepare the photo links. Please try again.' }
  }

  const { error } = await supabase.from('visits').update({ closed_at: new Date().toISOString() }).eq('id', visitId).is('closed_at', null)
  if (error) return { error: 'Could not record the message.' }
  await supabase.from('appointments').update({ status: 'done' }).eq('visit_id', visitId).eq('status', 'booked')
  const today = todayInIndia()
  if (visitInfo.date === today) {
    const { start, end } = indiaDayBounds(today)
    await supabase
      .from('appointments')
      .update({ status: 'done' })
      .eq('patient_id', visitInfo.patientId)
      .eq('status', 'booked')
      // A next visit booked from this visit for later today is still to come
      .or(`from_visit_id.is.null,from_visit_id.neq.${visitId}`)
      .gte('starts_at', start)
      .lte('starts_at', end)
  }
  refreshClinicScreens()
  return { message: { ...fresh, links } }
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
