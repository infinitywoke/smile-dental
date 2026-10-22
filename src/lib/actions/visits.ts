'use server'

import { RedirectType, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { PHOTO_BUCKET } from '@/lib/visit-status'
import { createClient } from '@/lib/supabase/server'
import { SHARE_LINK_SECONDS, appointmentsOfVisit, findOrCreateTodaysVisit, indiaDayBounds } from '@/lib/data/visits'
import { getVisitBill, type VisitBill } from '@/lib/data/billing'
import { getNextVisitSuggestion } from '@/lib/data/next-visit'
import { MAX_PHOTOS_TO_SEND, paymentsHeldMessage } from '@/lib/billing'
import { todayInIndia } from '@/lib/dates'
import { DEFAULT_LENGTH, clinicStartOf, isLength, lengthLabel } from '@/lib/schedule'
import { PHOTO_KINDS, type PhotoKind } from '@/lib/visit-status'
import { cancelledMessage, confirmationMessage, movedMessage, whatsappLink } from '@/lib/whatsapp'

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

// Notes save by themselves while the doctor types or records. Most saves don't refresh any screen
// (the visit page already shows what was typed); `refresh` is asked for when other screens need the
// change: the first note on an empty visit (it starts being listed) and when the doctor leaves the page.
export async function saveVisitNotes(visitId: string, notes: string, options: { refresh?: boolean } = {}): Promise<Result> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('visits').update({ notes: notes.slice(0, MAX_NOTES) }).eq('id', visitId).select('id')
  if (error) return { error: 'Could not save the notes.' }
  // Nothing changed: the visit was deleted (in another tab, say), so nothing was saved
  if (data.length === 0) return { error: "Couldn't save the note." }
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
  const { data, error } = await supabase.from('visit_photos').update({ caption: kind }).eq('id', photoId).select('id')
  if (error || data.length === 0) return { error: 'Could not save that. Please try again.' }
  refreshClinicScreens()
  return {}
}

// The file goes first, then the row: if storage fails, the photo stays on the visit (and can be
// deleted again) rather than leaving a file nobody can see but a sent link can still open.
// Removing a file that is already gone succeeds, so a retry is safe.
export async function deleteVisitPhoto(photoId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(photoId)) return { error: 'Invalid photo.' }
  const supabase = await createClient()
  const { data: photo, error: readError } = await supabase.from('visit_photos').select('storage_path').eq('id', photoId).maybeSingle()
  if (readError) return { error: 'Could not delete the photo.' }
  if (photo) {
    const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path])
    if (removeError) return { error: 'Could not delete the photo.' }
    const { error } = await supabase.from('visit_photos').delete().eq('id', photoId)
    if (error) return { error: 'Could not delete the photo.' }
  }
  refreshClinicScreens()
  return {}
}

// The suggested next visit, asked for by the visit page only when it shows the choice
export async function suggestNextVisit(visitId: string, minutes: number = DEFAULT_LENGTH, days: number = 7): Promise<string | null> {
  await getDoctor()
  if (!UUID.test(visitId)) return null
  const gap = Number.isInteger(days) && days >= 1 && days <= 400 ? days : 7
  return getNextVisitSuggestion(visitId, isLength(minutes) ? minutes : DEFAULT_LENGTH, gap)
}

// Books the next visit, only when the doctor taps a time. Choosing again moves the same booking.
// Once the visit's WhatsApp has gone, the patient has the old time (or none), so the reply carries
// the message to send: "moved to" for a moved booking, "confirmed" for a new one.
export async function bookNextVisit(
  visitId: string,
  startsAt: string,
  minutes: number = DEFAULT_LENGTH,
): Promise<Result & { whatsappUrl?: string }> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  const block = clinicStartOf(startsAt, minutes)
  if (!block) return { error: `A ${lengthLabel(minutes)} visit doesn't fit there. Please choose another time or a shorter length.` }
  if (block.date < todayInIndia()) return { error: 'That time has already passed.' }

  const supabase = await createClient()
  const { data: visit } = await supabase
    .from('visits')
    .select('patient_id, closed_at, patient:patients!inner (name, phone)')
    .eq('id', visitId)
    .maybeSingle()
  if (!visit) return { error: 'That visit was not found.' }

  const { data: existing } = await supabase
    .from('appointments')
    .select('id')
    .eq('from_visit_id', visitId)
    .eq('status', 'booked')
    .maybeSingle()
  const write = existing
    ? supabase.from('appointments').update({ starts_at: block.iso, duration_min: minutes }).eq('id', existing.id)
    : supabase.from('appointments').insert({
        patient_id: visit.patient_id,
        starts_at: block.iso,
        duration_min: minutes,
        reason: 'Follow-up',
        status: 'booked',
        from_visit_id: visitId,
      })
  const { error } = await write
  if (error) {
    // The database's own messages (a time already over, or blocked off) are written for the doctor
    return {
      error:
        error.code === '23P01'
          ? 'That time was just taken. Please choose another.'
          : error.code === 'P0001'
            ? error.message
            : 'Could not book the next visit. Please try again.',
    }
  }
  refreshClinicScreens()

  const patient = visit.patient as unknown as { name: string; phone: string | null }
  if (!visit.closed_at || !patient.phone) return {}
  const message = existing
    ? movedMessage({ name: patient.name, startsAt: block.iso })
    : confirmationMessage({ name: patient.name, startsAt: block.iso })
  return { whatsappUrl: whatsappLink(patient.phone, message) }
}

// Removes the next visit booked from this visit (booked by mistake). Once the visit's WhatsApp has gone,
// the patient knows that time, so the cancellation message is returned for one tap.
export async function removeNextVisit(visitId: string): Promise<Result & { whatsappUrl?: string }> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  const supabase = await createClient()
  const { data: visit } = await supabase
    .from('visits')
    .select('closed_at, patient:patients!inner (name, phone)')
    .eq('id', visitId)
    .maybeSingle()
  if (!visit) return { error: 'That visit was not found.' }
  const { data: removed, error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('from_visit_id', visitId)
    .eq('status', 'booked')
    .select('starts_at')
  if (error) return { error: 'Could not remove the next visit. Please try again.' }
  refreshClinicScreens()
  const patient = visit.patient as unknown as { name: string; phone: string | null }
  if (removed.length === 0 || !visit.closed_at || !patient.phone) return {}
  return { whatsappUrl: whatsappLink(patient.phone, cancelledMessage({ name: patient.name, startsAt: removed[0].starts_at })) }
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
// run one after another, so a booking, charge or payment tapped just before is already saved) and
// makes the 30-day links for the ticked photos (only now, and only photos of this visit). Nothing is
// recorded here: markWhatsappSent records the send once WhatsApp is actually opened.
export async function prepareWhatsapp(visitId: string, photoIds: string[] = []): Promise<Result & { message?: MessageData }> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  if (photoIds.length > MAX_PHOTOS_TO_SEND) return { error: `You can send up to ${MAX_PHOTOS_TO_SEND} photos at a time.` }
  if (photoIds.some((id) => !UUID.test(id))) return { error: 'Invalid photo.' }
  const supabase = await createClient()

  let fresh: Omit<MessageData, 'links'>
  try {
    const bill = await getVisitBill(visitId)
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

  return { message: { ...fresh, links } }
}

// WhatsApp is opening with the message: records every send as "WhatsApp sent" (the latest time) and
// clears "bill changed". The appointment the visit came from is done, and so are the patient's other
// bookings today that have already started; a booking later today is still to come, so it stays.
export async function markWhatsappSent(visitId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  const supabase = await createClient()

  const now = new Date().toISOString()
  const { data: visit, error } = await supabase
    .from('visits')
    .update({ closed_at: now, resend_needed: false })
    .eq('id', visitId)
    .select('patient_id, visit_date')
    .maybeSingle()
  if (error) return { error: 'Could not record the message.' }
  if (!visit) return { error: 'That visit was not found.' }

  await supabase.from('appointments').update({ status: 'done' }).eq('visit_id', visitId).eq('status', 'booked')
  const today = todayInIndia()
  if (visit.visit_date === today) {
    await supabase
      .from('appointments')
      .update({ status: 'done' })
      .eq('patient_id', visit.patient_id)
      .eq('status', 'booked')
      .gte('starts_at', indiaDayBounds(today).start)
      .lte('starts_at', now)
  }
  refreshClinicScreens()
  return {}
}

// Delete visit, in this order, so nothing is lost by accident and nothing is left behind:
// 1. a visit that holds payments is refused, naming the amounts (money is removed one payment at a time);
// 2. every photo file in the visit's folder goes (rows and stray uploads); if storage fails, stop;
// 3. the visit goes, with its notes, charges and photo rows;
// 4. the appointment it came from, marked done by the send, is booked again (unless that time was
//    taken since), so the patient shows on that day again.
// A retry after a lost reply finds the visit already gone: that is success.
export async function deleteVisit(visitId: string, patientId: string): Promise<Result> {
  const doctor = await getDoctor()
  if (!UUID.test(visitId) || !UUID.test(patientId)) return { error: 'Invalid visit.' }
  const supabase = await createClient()

  const { data: payments, error: paymentsError } = await supabase.from('payments').select('amount, method').eq('visit_id', visitId)
  if (paymentsError) return { error: 'Could not delete the visit.' }
  if (payments.length > 0) return { error: paymentsHeldMessage(payments.map((p) => ({ amount: Number(p.amount), method: p.method }))) }

  const folder = `${doctor.id}/${visitId}`
  const [rows, files, linked] = await Promise.all([
    supabase.from('visit_photos').select('storage_path').eq('visit_id', visitId),
    supabase.storage.from(PHOTO_BUCKET).list(folder, { limit: 1000 }),
    supabase.from('appointments').select('id').eq('visit_id', visitId).eq('status', 'done'),
  ])
  if (rows.error || files.error || linked.error) return { error: 'Could not delete the visit. Please try again.' }
  // Its recorded notes go too
  const { data: audio, error: audioError } = await supabase.storage.from('visit-audio').list(folder, { limit: 1000 })
  if (audioError) return { error: 'Could not delete the visit. Please try again.' }
  if (audio.length > 0) {
    const { error: removeAudioError } = await supabase.storage.from('visit-audio').remove(audio.map((f) => `${folder}/${f.name}`))
    if (removeAudioError) return { error: "Could not delete the visit's recordings. Please try again." }
  }
  const paths = new Set([...rows.data.map((p) => p.storage_path as string), ...files.data.map((f) => `${folder}/${f.name}`)])
  if (paths.size > 0) {
    const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove([...paths])
    if (removeError) return { error: "Could not delete the visit's photos. Please try again." }
  }

  const { data, error } = await supabase.from('visits').delete().eq('id', visitId).select('patient_id').maybeSingle()
  if (error) {
    // A payment recorded in another tab meanwhile: the database refuses too
    return { error: error.code === '23503' ? 'This visit holds payments. Remove them in Payment first, then delete the visit.' : 'Could not delete the visit.' }
  }

  // Booked again; if the time has been taken since (23P01), it stays as it is
  for (const appointment of linked.data) {
    await supabase.from('appointments').update({ status: 'booked' }).eq('id', appointment.id).eq('status', 'done')
  }
  refreshClinicScreens()
  // Replace, so Back doesn't return to the deleted visit
  redirect(`/app/patients/${data?.patient_id ?? patientId}`, RedirectType.replace)
}
