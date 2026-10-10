'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { findPatientsByPhone } from '@/lib/data/patients'
import { PHOTO_BUCKET } from '@/lib/data/visits'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { todayInIndia } from '@/lib/dates'
import { isPracticeMode } from '@/lib/practice'

export type PatientFormState = { error?: string }

function readPatientForm(formData: FormData) {
  const text = (key: string) => {
    const value = String(formData.get(key) ?? '').trim()
    return value.length > 0 ? value : null
  }
  return {
    name: text('name'),
    phone: normalizePhone(text('phone')),
    date_of_birth: text('date_of_birth'),
    address: text('address'),
    medical_alerts: text('medical_alerts'),
    heard_from: text('heard_from'),
  }
}

function validate(patient: ReturnType<typeof readPatientForm>): string | null {
  if (!patient.name) return 'Please enter the patient’s name.'
  if (patient.phone && !isValidPhone(patient.phone)) return 'Please enter a 10-digit mobile number.'
  if (patient.date_of_birth && patient.date_of_birth > todayInIndia()) return 'Date of birth can’t be in the future.'
  return null
}

// New patients go straight to their first visit
export async function createPatient(_prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  await getDoctor()
  const patient = readPatientForm(formData)
  const problem = validate(patient)
  if (problem) return { error: problem }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('patients')
    .insert({ ...patient, is_test: await isPracticeMode() })
    .select('id')
    .single()
  if (error) return { error: 'Could not save the patient. Please try again.' }

  revalidatePath('/app', 'layout')
  redirect(`/app/patients/${data.id}/visits/new`)
}

export async function updatePatient(id: string, _prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  await getDoctor()
  const patient = readPatientForm(formData)
  const problem = validate(patient)
  if (problem) return { error: problem }

  const supabase = await createClient()
  const { error } = await supabase.from('patients').update(patient).eq('id', id)
  if (error) return { error: 'Could not save the changes. Please try again.' }

  revalidatePath('/app', 'layout')
  redirect(`/app/patients/${id}`)
}

// Used while typing a phone number, to spot returning patients
export async function lookupPhone(input: string) {
  const phone = normalizePhone(input)
  if (!isValidPhone(phone)) return []
  const matches = await findPatientsByPhone(phone!)
  return matches.map(({ id, name, date_of_birth }) => ({ id, name, date_of_birth }))
}

// Removes every patient marked as a test patient, with their visits, photo records
// (database cascade) and photo files in Storage.
export async function deleteTestPatients(): Promise<{ error?: string; deleted?: number }> {
  await getDoctor()
  const supabase = await createClient()
  const { data: testPatients, error } = await supabase.from('patients').select('id').eq('is_test', true)
  if (error) return { error: 'Could not find the test patients.' }

  // Test booking requests (from the website) go too, including ones not yet turned into patients
  const { data: testRequests, error: requestsError } = await supabase
    .from('booking_requests')
    .delete()
    .eq('is_test', true)
    .select('id')
  if (requestsError) return { error: 'Could not delete the test booking requests.' }

  if (testPatients.length === 0) {
    revalidatePath('/app', 'layout')
    return { deleted: testRequests.length }
  }
  const ids = testPatients.map((p) => p.id)

  // Collect photo files first; stop if that fails, so no files are orphaned
  const { data: photos, error: photosError } = await supabase
    .from('visit_photos')
    .select('storage_path, visits!inner (patient_id)')
    .in('visits.patient_id', ids)
  if (photosError) return { error: 'Could not find the test patients’ photos.' }

  const { error: deleteError } = await supabase.from('patients').delete().in('id', ids)
  if (deleteError) return { error: 'Could not delete the test patients.' }
  if (photos.length > 0) await supabase.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.storage_path))

  revalidatePath('/app', 'layout')
  return { deleted: ids.length }
}
