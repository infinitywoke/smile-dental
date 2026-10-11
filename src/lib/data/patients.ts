import 'server-only'
import { notFound } from 'next/navigation'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import type { Patient } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PATIENT_COLUMNS = 'id, name, phone, date_of_birth, address, medical_alerts, heard_from, is_test, created_at, updated_at'

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
