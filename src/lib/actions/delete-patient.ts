'use server'

import { RedirectType, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { formatDate, todayInIndia } from '@/lib/dates'
import { PHOTO_BUCKET } from '@/lib/visit-status'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// "everything": the patient and all of theirs, payments included.
// "keep-money": their details, notes and photos are erased, but the record stays as "Deleted patient",
// so visits, bill lines and payments still add up in the books (and match Tally).
export type DeleteMode = 'everything' | 'keep-money'

// Deleting a patient can't be undone, so it asks for the doctor's password. It is checked on the server
// with a separate sign-in that is signed out again at once: his own session on the phone is untouched.
export async function deletePatient(patientId: string, mode: DeleteMode, password: string): Promise<{ error?: string }> {
  const doctor = await getDoctor()
  if (!UUID.test(patientId)) return { error: 'Invalid patient.' }
  if (mode !== 'everything' && mode !== 'keep-money') return { error: 'Please choose what to delete.' }
  if (!password) return { error: 'Please type your password.' }

  const verifier = createPublicClient()
  const { data: check, error: authError } = await verifier.auth.signInWithPassword({ email: doctor.email, password })
  if (authError || check.user?.id !== doctor.id) return { error: 'Wrong password. Nothing was deleted.' }
  await verifier.auth.signOut({ scope: 'local' }).catch(() => {})

  const supabase = await createClient()
  const { data: patient, error: findError } = await supabase.from('patients').select('id').eq('id', patientId).maybeSingle()
  if (findError) return { error: 'Could not delete the patient. Please try again.' }
  // Already gone: a retry after a lost reply
  if (!patient) redirect('/app/patients', RedirectType.replace)

  // Photo files first (every file in each visit's folder, rows and stray uploads); if storage fails, stop
  const { data: visits, error: visitsError } = await supabase.from('visits').select('id').eq('patient_id', patientId)
  if (visitsError) return { error: 'Could not delete the patient. Please try again.' }
  const visitIds = visits.map((v) => v.id as string)
  const paths = new Set<string>()
  if (visitIds.length > 0) {
    const { data: rows, error: rowsError } = await supabase.from('visit_photos').select('storage_path').in('visit_id', visitIds)
    if (rowsError) return { error: 'Could not delete the photos. Nothing was deleted.' }
    rows.forEach((r) => paths.add(r.storage_path as string))
    for (const visitId of visitIds) {
      const folder = `${doctor.id}/${visitId}`
      const { data: files, error: listError } = await supabase.storage.from(PHOTO_BUCKET).list(folder, { limit: 1000 })
      if (listError) return { error: 'Could not delete the photos. Nothing was deleted.' }
      files.forEach((f) => paths.add(`${folder}/${f.name}`))
    }
  }
  // Their recorded notes, kept with each visit
  const audioPaths: string[] = []
  for (const visitId of visitIds) {
    const folder = `${doctor.id}/${visitId}`
    const { data: files, error: listError } = await supabase.storage.from('visit-audio').list(folder, { limit: 1000 })
    if (listError) return { error: 'Could not delete the recordings. Nothing was deleted.' }
    files.forEach((f) => audioPaths.push(`${folder}/${f.name}`))
  }
  if (audioPaths.length > 0) {
    const { error: audioError } = await supabase.storage.from('visit-audio').remove(audioPaths)
    if (audioError) return { error: 'Could not delete the recordings. Please try again.' }
  }
  if (visitIds.length > 0) await supabase.from('visit_recordings').delete().in('visit_id', visitIds)

  const all = [...paths]
  for (let i = 0; i < all.length; i += 100) {
    const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove(all.slice(i, i + 100))
    if (removeError) return { error: 'Could not delete the photos. Please try again.' }
  }

  // Their website requests' voice notes go first (private recordings of the patient)
  const { data: voiced } = await supabase.from('booking_requests').select('voice_note').eq('patient_id', patientId).not('voice_note', 'is', null)
  const voicePaths = (voiced ?? []).map((r) => r.voice_note as string)
  if (voicePaths.length > 0) {
    const { error: voiceError } = await supabase.storage.from('request-voice').remove(voicePaths)
    if (voiceError) return { error: 'Could not delete the voice notes. Please try again.' }
  }

  // Website requests carry the name, phone and medical alerts: they go in both cases
  const { error: requestsError } = await supabase.from('booking_requests').delete().eq('patient_id', patientId)
  if (requestsError) return { error: 'Could not delete the patient. Please try again.' }

  if (mode === 'everything') {
    // Payments first: a visit holding payments can't be deleted on its own
    const { error: paymentsError } = await supabase.from('payments').delete().eq('patient_id', patientId)
    if (paymentsError) return { error: 'Could not delete the payments. Please try again.' }
    const { error } = await supabase.from('patients').delete().eq('id', patientId)
    if (error) return { error: 'Could not delete the patient. Please try again.' }
  } else {
    const now = new Date().toISOString()
    const steps = [
      visitIds.length > 0 ? supabase.from('visit_photos').delete().in('visit_id', visitIds) : null,
      visitIds.length > 0 ? supabase.from('share_links').delete().in('visit_id', visitIds) : null,
      supabase.from('visits').update({ notes: '' }).eq('patient_id', patientId),
      supabase.from('appointments').update({ status: 'cancelled' }).eq('patient_id', patientId).eq('status', 'booked').gt('starts_at', now),
      supabase.from('appointments').update({ reason: '' }).eq('patient_id', patientId),
      supabase
        .from('patients')
        .update({
          name: `Deleted patient (${formatDate(todayInIndia())})`,
          phone: null,
          address: null,
          medical_alerts: null,
          heard_from: null,
          gender: null,
          birth_year: null,
          birth_date: null,
          // name + age + place: a later Tally file names the deleted patient's own ledger instead
          tally_ledger: null,
          tally_ledger_listed: false,
        })
        .eq('id', patientId),
    ]
    for (const step of steps) {
      if (!step) continue
      const { error } = await step
      if (error) return { error: 'Could not finish deleting the patient. Please try again.' }
    }
  }

  revalidatePath('/app', 'layout')
  redirect('/app/patients', RedirectType.replace)
}
