import 'server-only'
import { notFound } from 'next/navigation'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { todayInIndia } from '@/lib/dates'
import type { Patient, Visit, VisitPhoto } from './types'

export const PHOTO_BUCKET = 'visit-photos'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VISIT_COLUMNS = 'id, patient_id, visit_date, notes, created_at, updated_at'

export type TodayVisit = Visit & { patient: Pick<Patient, 'id' | 'name' | 'phone' | 'medical_alerts' | 'is_test'>; photo_count: number }

export async function getTodayVisits(): Promise<TodayVisit[]> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visits')
    .select(`${VISIT_COLUMNS}, patient:patients!inner (id, name, phone, medical_alerts, is_test), visit_photos (count)`)
    .eq('visit_date', todayInIndia())
    .order('created_at', { ascending: false })
  if (error) throw error

  return data.map(({ visit_photos, patient, ...visit }) => ({
    ...visit,
    patient: Array.isArray(patient) ? patient[0] : patient,
    photo_count: visit_photos?.[0]?.count ?? 0,
  }))
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

export type VisitDetail = Visit & { patient: Pick<Patient, 'id' | 'name' | 'medical_alerts'>; photos: VisitPhoto[] }

export async function getVisit(id: string): Promise<VisitDetail> {
  await getDoctor()
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visits')
    .select(`${VISIT_COLUMNS}, patient:patients!inner (id, name, medical_alerts), visit_photos (id, caption, storage_path, created_at)`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) notFound()

  const { visit_photos, patient, ...visit } = data
  const photos = [...(visit_photos ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))

  // The bucket is private, so photos are shown through short-lived signed links
  let urls: Record<string, string> = {}
  if (photos.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(photos.map((p) => p.storage_path), 60 * 60)
    // On failure the photos show as "Unavailable" rather than hiding the whole visit
    if (!signError) {
      urls = Object.fromEntries(signed.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl]] : [])))
    }
  }

  return {
    ...visit,
    patient: Array.isArray(patient) ? patient[0] : patient,
    photos: photos.map((p) => ({ id: p.id, caption: p.caption, url: urls[p.storage_path] ?? null })),
  }
}
