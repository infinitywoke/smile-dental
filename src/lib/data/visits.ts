import 'server-only'
import { notFound } from 'next/navigation'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { sumAmounts } from '@/lib/billing'
import { todayInIndia } from '@/lib/dates'
import { isEmptyVisit, visitStatus } from '@/lib/visit-status'
import type { Patient, Visit, VisitDetail, VisitStatus } from './types'

export const PHOTO_BUCKET = 'visit-photos'
// Photos are shown on screen through short-lived links; links that go to a patient (30 days)
// are made only when the doctor taps Send, only for the photos he ticked
const DISPLAY_LINK_SECONDS = 60 * 60
export const SHARE_LINK_SECONDS = 60 * 60 * 24 * 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VISIT_COLUMNS = 'id, patient_id, visit_date, notes, created_at, updated_at, closed_at'

export type TodayVisit = Visit & {
  patient: Pick<Patient, 'id' | 'name' | 'phone' | 'medical_alerts' | 'is_test'>
  photo_count: number
  status: VisitStatus
  total: number
  paid: number
  balance: number
}

export async function getVisitsOn(date: string): Promise<TodayVisit[]> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visits')
    .select(`${VISIT_COLUMNS}, patient:patients!inner (id, name, phone, medical_alerts, is_test), visit_photos (count), visit_charges (amount), payments (amount)`)
    .eq('visit_date', date)
    .order('created_at', { ascending: false })
  if (error) throw error

  // A visit with nothing in it (started, then left) is not listed
  const filled = data.filter(
    (row) =>
      !isEmptyVisit({
        notes: row.notes,
        photos: row.visit_photos?.[0]?.count ?? 0,
        charges: row.visit_charges?.length ?? 0,
        payments: row.payments?.length ?? 0,
      }),
  )

  return filled.map(({ visit_photos, patient, visit_charges, payments, ...visit }) => {
    const charges = ((visit_charges ?? []) as { amount: number }[]).map((c) => ({ amount: Number(c.amount) }))
    const pmts = ((payments ?? []) as { amount: number }[]).map((p) => ({ amount: Number(p.amount) }))
    const total = sumAmounts(charges)
    const paid = sumAmounts(pmts)
    const balance = Math.round((total - paid) * 100) / 100

    return {
      ...visit,
      patient: Array.isArray(patient) ? patient[0] : patient,
      photo_count: visit_photos?.[0]?.count ?? 0,
      status: visitStatus({ closedAt: visit.closed_at, total, paid }),
      total,
      paid,
      balance,
    }
  })
}

export type VisitPageData = VisitDetail & { next_booked_here: boolean }

export async function getVisit(id: string): Promise<VisitPageData> {
  await getDoctor()
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('visits')
    .select(`${VISIT_COLUMNS}, patient:patients!inner (id, name, phone, medical_alerts, is_test), visit_photos (id, caption, storage_path, created_at)`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) notFound()

  const { visit_photos, patient, ...visit } = data
  const patientRow = Array.isArray(patient) ? patient[0] : patient
  const photos = [...(visit_photos ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))

  const { linked: linkedAppointment, next } = await appointmentsOfVisit(id, patientRow.id)

  // The bucket is private, so photos are shown through short-lived signed links
  let urls: Record<string, string> = {}
  if (photos.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(photos.map((p) => p.storage_path), DISPLAY_LINK_SECONDS)
    // On failure the photos show as "Unavailable" rather than hiding the whole visit
    if (!signError && signed) {
      urls = Object.fromEntries(signed.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl]] : [])))
    }
  }

  return {
    ...visit,
    patient: patientRow,
    photos: photos.map((p) => ({ id: p.id, caption: p.caption ?? '', url: urls[p.storage_path] ?? null })),
    linked_appointment: linkedAppointment,
    next_appointment: next && { id: next.id, starts_at: next.starts_at, status: next.status },
    // The next visit was booked from this visit, so it can be changed from here
    next_booked_here: next?.from_visit_id === id,
  }
}

// The appointment a visit came from, and the patient's next future appointment (if any).
// Used by the visit page and, read fresh at the tap, by the WhatsApp message.
export async function appointmentsOfVisit(visitId: string, patientId: string) {
  await getDoctor()
  const supabase = await createClient()
  const [linked, upcoming] = await Promise.all([
    supabase.from('appointments').select('id, starts_at, status').eq('visit_id', visitId).maybeSingle(),
    supabase
      .from('appointments')
      .select('id, starts_at, status, from_visit_id')
      .eq('patient_id', patientId)
      .eq('status', 'booked')
      .gt('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(2),
  ])
  if (linked.error) throw linked.error
  if (upcoming.error) throw upcoming.error
  const linkedAppointment = linked.data ?? null
  return { linked: linkedAppointment, next: upcoming.data.find((a) => a.id !== linkedAppointment?.id) ?? null }
}

// Today's visit for a patient: the latest one already started today, else a new one.
// The new visit's id can come from the phone, so a retry or a second tap never makes a second visit.
export async function findOrCreateTodaysVisit(
  patientId: string,
  options: { visitId?: string; appointmentId?: string } = {},
): Promise<string | null> {
  await getDoctor()
  if (!UUID.test(patientId)) return null
  const supabase = await createClient()
  const today = todayInIndia()
  const appointmentId = options.appointmentId && UUID.test(options.appointmentId) ? options.appointmentId : null

  const { data: existing, error: findError } = await supabase
    .from('visits')
    .select('id')
    .eq('patient_id', patientId)
    .eq('visit_date', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (findError) return null
  if (existing) {
    // Started from an appointment: link it to today's visit, unless the visit already has one
    if (appointmentId) await linkAppointment(existing.id, patientId, appointmentId)
    return existing.id
  }

  let visitId = options.visitId && UUID.test(options.visitId) ? options.visitId : crypto.randomUUID()
  const { error } = await supabase.from('visits').insert({ id: visitId, patient_id: patientId, visit_date: today })
  if (error) {
    if (error.code !== '23505') return null
    // The same id again: an earlier tap made it. Reuse it only if it is this patient's visit today,
    // so a screen left open overnight never reopens yesterday's visit.
    const { data: same } = await supabase.from('visits').select('patient_id, visit_date').eq('id', visitId).maybeSingle()
    if (!same || same.patient_id !== patientId || same.visit_date !== today) {
      visitId = crypto.randomUUID()
      const { error: retryError } = await supabase.from('visits').insert({ id: visitId, patient_id: patientId, visit_date: today })
      if (retryError) return null
    }
  }

  // Link today's appointment: the one tapped, else the patient's first booked one today
  if (appointmentId) {
    await linkAppointment(visitId, patientId, appointmentId)
  } else {
    const { data: appointment } = await supabase
      .from('appointments')
      .select('id')
      .eq('patient_id', patientId)
      .eq('status', 'booked')
      .is('visit_id', null)
      .gte('starts_at', `${today}T00:00:00+05:30`)
      .lte('starts_at', `${today}T23:59:59+05:30`)
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (appointment) await supabase.from('appointments').update({ visit_id: visitId }).eq('id', appointment.id)
  }
  return visitId
}

// One appointment per visit: links the patient's appointment to the visit if none is linked yet
async function linkAppointment(visitId: string, patientId: string, appointmentId: string) {
  const supabase = await createClient()
  const { data: linked, error } = await supabase.from('appointments').select('id').eq('visit_id', visitId).limit(1)
  if (error || linked.length > 0) return
  await supabase.from('appointments').update({ visit_id: visitId }).eq('id', appointmentId).eq('patient_id', patientId).is('visit_id', null)
}
