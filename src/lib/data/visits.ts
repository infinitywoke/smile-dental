import 'server-only'
import { notFound } from 'next/navigation'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayInIndia } from '@/lib/dates'
import { sumAmounts } from '@/lib/billing'
import { visitStatus } from '@/lib/visit-status'
import type { Patient, Visit, VisitDetail, VisitStatus } from './types'

export const PHOTO_BUCKET = 'visit-photos'
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

  return data.map(({ visit_photos, patient, visit_charges, payments, ...visit }) => {
    const charges = (visit_charges ?? []) as { amount: number }[]
    const pmts = (payments ?? []) as { amount: number }[]
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

export async function getTodayVisits(): Promise<TodayVisit[]> {
  await getDoctor()
  return getVisitsOn(todayInIndia())
}

export type VisitSummary = Visit & { photo_count: number }

export async function getPatientVisits(patientId: string): Promise<VisitSummary[]> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visits')
    .select(`${VISIT_COLUMNS}, visit_photos (count)`)
    .eq('patient_id', patientId)
    .order('visit_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  return data.map(({ visit_photos, ...visit }) => ({ ...visit, photo_count: visit_photos?.[0]?.count ?? 0 }))
}

export async function getVisit(id: string): Promise<VisitDetail> {
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

  // The appointment this visit came from, and the patient's next future appointment (if any)
  const [linked, upcoming] = await Promise.all([
    supabase.from('appointments').select('id, starts_at, status').eq('visit_id', id).maybeSingle(),
    supabase
      .from('appointments')
      .select('id, starts_at, status')
      .eq('patient_id', patientRow.id)
      .eq('status', 'booked')
      .gt('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(2),
  ])
  if (linked.error) throw linked.error
  if (upcoming.error) throw upcoming.error
  const linkedAppointment = linked.data ?? null
  const nextAppointment = upcoming.data.find((a) => a.id !== linkedAppointment?.id) ?? null

  // The bucket is private, so photos are shown through short-lived signed links.
  // Links that go to a patient (30 days) are only made when the message is sent.
  let urls: Record<string, string> = {}
  if (photos.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(photos.map((p) => p.storage_path), 60 * 60)
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
    next_appointment: nextAppointment,
  }
}
