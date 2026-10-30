'use server'

import { randomBytes } from 'node:crypto'
import { RedirectType, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getClinicId, getDoctor } from '@/lib/auth'
import { isVisitFile, visitFolders } from '@/lib/clinic-files'
import { PHOTO_BUCKET } from '@/lib/visit-status'
import { createClient } from '@/lib/supabase/server'
import { SHARE_LINK_SECONDS, appointmentsOfVisit, findOrCreateTodaysVisit, indiaDayBounds } from '@/lib/data/visits'
import { getVisitBill, type VisitBill } from '@/lib/data/billing'
import { getClinic } from '@/lib/data/clinic'
import { getNextVisitSuggestion } from '@/lib/data/next-visit'
import { MAX_PHOTOS_TO_SEND, paymentsHeldMessage } from '@/lib/billing'
import { todayInIndia } from '@/lib/dates'
import { DEFAULT_LENGTH, clinicStartOf, isLength, lengthLabel } from '@/lib/schedule'
import { PHOTO_KINDS, otherName, photoCaption, photoKind, photoLabel, type PhotoKind } from '@/lib/visit-status'
import { siteConfig } from '@/config/site'
import { adviceText, prescriptionLines } from '@/lib/prescription'
import { patientAge } from '@/lib/patient-fields'
import type { SharedItem } from '@/lib/share-link'
import { cancelledMessage, confirmationMessage, messageLanguage, movedMessage, whatsappLink } from '@/lib/whatsapp'

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

// Records a photo the phone has just uploaded. The path must sit in this visit's folder: the clinic's, or
// the doctor's own (from a copy of the app older than the clinic's folder); a retry of the same photo is
// ignored (the path is unique).
export async function addVisitPhoto(visitId: string, path: string): Promise<Result> {
  const [doctor, clinicId] = await Promise.all([getDoctor(), getClinicId()])
  if (!UUID.test(visitId) || !isVisitFile(path, visitFolders(clinicId, doctor.id, visitId))) return { error: 'Invalid photo.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('visit_photos')
    .upsert({ visit_id: visitId, storage_path: path, caption: '' }, { onConflict: 'storage_path', ignoreDuplicates: true })
  if (error) return { error: 'The photo uploaded, but could not be added to the visit.' }
  refreshClinicScreens()
  return {}
}

// One tap under a photo: Prescription, X-ray or Other (stored as the caption)
// An "Other" photo can carry the name he typed ("Lab slip")
export async function setPhotoKind(photoId: string, kind: PhotoKind, name?: string | null): Promise<Result> {
  await getDoctor()
  if (!UUID.test(photoId) || !PHOTO_KINDS.includes(kind)) return { error: 'Invalid photo.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('visit_photos').update({ caption: photoCaption(kind, name) }).eq('id', photoId).select('id')
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
    .select('patient_id, closed_at, patient:patients!inner (name, phone, language)')
    .eq('id', visitId)
    .maybeSingle()
  if (!visit) return { error: 'That visit was not found.' }
  const patient = visit.patient as unknown as { name: string; phone: string | null; language: string | null }
  // Once the visit's WhatsApp has gone the patient is told, in the clinic's words: read before anything is saved
  const clinic = visit.closed_at && patient.phone ? await getClinic() : null

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

  if (!clinic || !patient.phone) return {}
  const to = { name: patient.name, startsAt: block.iso, language: messageLanguage(patient.language) }
  const message = existing ? movedMessage(clinic, to) : confirmationMessage(clinic, to)
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
    .select('closed_at, patient:patients!inner (name, phone, language)')
    .eq('id', visitId)
    .maybeSingle()
  if (!visit) return { error: 'That visit was not found.' }
  const patient = visit.patient as unknown as { name: string; phone: string | null; language: string | null }
  // Once the visit's WhatsApp has gone the patient is told, in the clinic's words: read before anything is cancelled
  const clinic = visit.closed_at && patient.phone ? await getClinic() : null
  const { data: removed, error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('from_visit_id', visitId)
    .eq('status', 'booked')
    .select('starts_at')
  if (error) return { error: 'Could not remove the next visit. Please try again.' }
  refreshClinicScreens()
  if (removed.length === 0 || !clinic || !patient.phone) return {}
  return { whatsappUrl: whatsappLink(patient.phone, cancelledMessage(clinic, { name: patient.name, startsAt: removed[0].starts_at, language: messageLanguage(patient.language) })) }
}

// What the WhatsApp message says, read fresh from the database at the tap
export type MessageData = {
  charges: VisitBill['charges']
  payments: VisitBill['payments']
  summary: VisitBill['summary']
  nextAppointment: { starts_at: string } | null
  // One short link to a page with the typed prescription, the ticked photos and the bill, for 30 days,
  // and what it holds ("Prescription", "X-ray", a typed name, "Bill"); null when there is none of these
  photoLink: { url: string; labels: string[] } | null
}

// The address the doctor is using (Clinic OS's, or the test server), for links in messages
async function siteOrigin(): Promise<string> {
  const origin = (await headers()).get('origin')
  return origin && /^https?:\/\/[^/]+$/.test(origin) ? origin : siteConfig.clinicOsUrl
}

const PHOTO_LINK_FAILED = 'Could not prepare the photo link. Please try again.'

// The doctor tapped Send on WhatsApp. Reads the bill and the next appointment fresh (server actions
// run one after another, so a booking, charge or payment tapped just before is already saved) and
// makes the short link for the typed prescription (the notes' "Prescription:" lines, read fresh too),
// the ticked photos (only now, and only photos of this visit) and the bill: 30-day file links for the
// photos, kept with a new 32-character code (share_links) that the page /r/<code> looks up.
// Nothing else is recorded here: markWhatsappSent records the send once WhatsApp is actually opened.
export async function prepareWhatsapp(visitId: string, photoIds: string[] = []): Promise<Result & { message?: MessageData }> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Invalid visit.' }
  if (photoIds.length > MAX_PHOTOS_TO_SEND) return { error: `You can send up to ${MAX_PHOTOS_TO_SEND} photos at a time.` }
  if (photoIds.some((id) => !UUID.test(id))) return { error: 'Invalid photo.' }
  const supabase = await createClient()

  let fresh: Omit<MessageData, 'photoLink'>
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

  // The typed prescription first (the page draws it on the letterhead), then the ticked photos
  const { data: notesRow, error: notesError } = await supabase
    .from('visits').select('notes, patient:patients!inner (name, birth_year, birth_date)').eq('id', visitId).maybeSingle()
  if (notesError) return { error: 'Could not prepare the message. Please try again.' }
  const notes = notesRow?.notes ?? ''
  const medicines = prescriptionLines(notes)
  // With the patient's name and age, as a prescription carries them
  const who = notesRow?.patient as unknown as { name: string; birth_year: number | null; birth_date: string | null } | undefined
  const shown: SharedItem[] = medicines.length > 0
    ? [{ kind: 'prescription', label: 'Prescription', medicines, advice: adviceText(notes), patient: who?.name, age: who ? patientAge(who) : null }]
    : []

  if (photoIds.length > 0) {
    const { data: photos, error } = await supabase
      .from('visit_photos').select('id, storage_path, caption').eq('visit_id', visitId).in('id', photoIds).order('created_at')
    if (error || photos.length !== new Set(photoIds).size) return { error: PHOTO_LINK_FAILED }
    const { data: signed, error: signError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(photos.map((p) => p.storage_path), SHARE_LINK_SECONDS)
    if (signError || !signed) return { error: PHOTO_LINK_FAILED }
    const urlByPath = new Map(signed.flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])))
    for (const p of photos) {
      const url = urlByPath.get(p.storage_path)
      if (!url) return { error: PHOTO_LINK_FAILED }
      shown.push({ label: photoLabel(photoKind(p.caption), otherName(p.caption)), url })
    }
  }

  // The bill, as it stands now, is on the page only: the message carries no money
  const { charges, payments, summary } = fresh
  const kept: SharedItem[] = summary.total > 0 || summary.paid > 0 || summary.due !== 0
    ? [...shown, {
        kind: 'bill', label: 'Bill',
        lines: charges.map((c) => ({ description: c.description, amount: Number(c.amount) })),
        total: summary.total, paid: summary.paid, earlier: summary.earlier, due: summary.due,
        methods: [...new Set(payments.map((p) => (p.method === 'upi' ? 'UPI' : 'Cash')))],
      }]
    : shown
  let photoLink: MessageData['photoLink'] = null
  if (kept.length > 0) {
    // 24 random bytes: 32 characters that can't be guessed
    const token = randomBytes(24).toString('base64url')
    const { error: linkError } = await supabase.from('share_links').insert({ visit_id: visitId, token, photos: kept })
    if (linkError) return { error: PHOTO_LINK_FAILED }
    photoLink = { url: `${await siteOrigin()}/r/${token}`, labels: kept.map((s) => s.label) }
  }

  return { message: { ...fresh, photoLink } }
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
// 2. every photo and recording of the visit goes (rows, and stray uploads in its folders); if storage fails, stop;
// 3. the visit goes, with its notes, charges and photo rows;
// 4. the appointment it came from, marked done by the send, is booked again (unless that time was
//    taken since), so the patient shows on that day again.
// A retry after a lost reply finds the visit already gone: that is success.
export async function deleteVisit(visitId: string, patientId: string): Promise<Result> {
  const [doctor, clinicId] = await Promise.all([getDoctor(), getClinicId()])
  if (!UUID.test(visitId) || !UUID.test(patientId)) return { error: 'Invalid visit.' }
  const supabase = await createClient()

  const { data: payments, error: paymentsError } = await supabase.from('payments').select('amount, method').eq('visit_id', visitId)
  if (paymentsError) return { error: 'Could not delete the visit.' }
  if (payments.length > 0) return { error: paymentsHeldMessage(payments.map((p) => ({ amount: Number(p.amount), method: p.method }))) }

  const [rows, recordings, linked] = await Promise.all([
    supabase.from('visit_photos').select('storage_path').eq('visit_id', visitId),
    supabase.from('visit_recordings').select('storage_path').eq('visit_id', visitId),
    supabase.from('appointments').select('id').eq('visit_id', visitId).eq('status', 'done'),
  ])
  if (rows.error || recordings.error || linked.error) return { error: 'Could not delete the visit. Please try again.' }
  const paths = new Set(rows.data.map((p) => p.storage_path as string))
  const audioPaths = new Set(recordings.data.map((r) => r.storage_path as string))
  // …and stray uploads in the visit's folders: the clinic's, and his own from before
  for (const folder of visitFolders(clinicId, doctor.id, visitId)) {
    const [files, audio] = await Promise.all([
      supabase.storage.from(PHOTO_BUCKET).list(folder, { limit: 1000 }),
      supabase.storage.from('visit-audio').list(folder, { limit: 1000 }),
    ])
    if (files.error || audio.error) return { error: 'Could not delete the visit. Please try again.' }
    files.data.forEach((f) => paths.add(`${folder}/${f.name}`))
    audio.data.forEach((f) => audioPaths.add(`${folder}/${f.name}`))
  }
  // Its recorded notes go too
  if (audioPaths.size > 0) {
    const { error: removeAudioError } = await supabase.storage.from('visit-audio').remove([...audioPaths])
    if (removeAudioError) return { error: "Could not delete the visit's recordings. Please try again." }
  }
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
