import 'server-only'
import { notFound } from 'next/navigation'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import type { Patient } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATIENT_COLUMNS = 'id, name, phone, birth_year, birth_date, gender, address, medical_alerts, heard_from, consent_at, language, created_at, updated_at'

// Search by name or phone number. Without a query, returns the newest patients.
export async function searchPatients(query: string): Promise<Patient[]> {
  await getDoctor()
  const supabase = await createClient()
  const q = query.trim()

  let request = supabase.from('patients').select(PATIENT_COLUMNS).order('created_at', { ascending: false }).limit(30)

  if (q) {
    // Digits search the phone number; anything else searches the name
    const digits = q.replace(/[\s+-]/g, '')
    request = /^\d{3,}$/.test(digits)
      ? request.like('phone', `%${normalizePhone(digits)}%`)
      : request.ilike('name', `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
  }

  const { data, error } = await request
  if (error) throw error
  return data
}

export async function getPatient(id: string): Promise<Patient> {
  await getDoctor()
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()
  const { data, error } = await supabase.from('patients').select(PATIENT_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) notFound()
  return data
}

export async function findPatientsByPhone(phone: string): Promise<Patient[]> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase.from('patients').select(PATIENT_COLUMNS).eq('phone', phone).order('name')
  if (error) throw error
  return data
}

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

// The patients among `patients` with exactly this name (ignoring case and spacing)
export function withSameName<T extends { name: string }>(name: string, patients: T[]): T[] {
  return patients.filter((p) => nameKey(p.name) === nameKey(name))
}

// "Prakash Shetty", "Prakash Shetty and Asha Shetty", "A, B and C"
export function namesList(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// Who a website request most likely is, among the patients with its phone number: the one with the
// same name, or the only one with that number. Null when it can't be told, so the doctor chooses.
export function likelyPatient<T extends { id: string; name: string }>(name: string, samePhone: T[]): T | null {
  const same = withSameName(name, samePhone)
  if (same.length === 1) return same[0]
  if (same.length === 0 && samePhone.length === 1) return samePhone[0]
  return null
}

// What deleting a patient would remove, for the confirmation screen
export type PatientFootprint = {
  visits: number
  photos: number
  payments: { count: number; total: number }
  coming: { id: string; starts_at: string }[]
}

export async function getPatientFootprint(id: string): Promise<PatientFootprint> {
  await getDoctor()
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()
  const [visits, photos, payments, coming] = await Promise.all([
    supabase.from('visits').select('id', { count: 'exact', head: true }).eq('patient_id', id),
    supabase.from('visit_photos').select('id, visits!inner (patient_id)', { count: 'exact', head: true }).eq('visits.patient_id', id),
    supabase.from('payments').select('amount').eq('patient_id', id),
    supabase
      .from('appointments')
      .select('id, starts_at')
      .eq('patient_id', id)
      .eq('status', 'booked')
      .gt('starts_at', new Date().toISOString())
      .order('starts_at'),
  ])
  if (visits.error) throw visits.error
  if (photos.error) throw photos.error
  if (payments.error) throw payments.error
  if (coming.error) throw coming.error
  const paise = payments.data.reduce((sum, p) => sum + Math.round(Number(p.amount) * 100), 0)
  return {
    visits: visits.count ?? 0,
    photos: photos.count ?? 0,
    payments: { count: payments.data.length, total: paise / 100 },
    coming: coming.data,
  }
}
