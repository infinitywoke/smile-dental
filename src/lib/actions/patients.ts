'use server'

import { RedirectType, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { findPatientsByPhone, searchPatients } from '@/lib/data/patients'
import { findOrCreateTodaysVisit } from '@/lib/data/visits'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { formatPhone } from '@/lib/phone'
import { birthYearFromAge, parseAge, patientAge, titleCaseName } from '@/lib/patient-fields'
import { parseGender } from '@/lib/gender'

export type PatientFormState = { error?: string }

function readPatientForm(formData: FormData) {
  const text = (key: string) => {
    const value = String(formData.get(key) ?? '').trim()
    return value.length > 0 ? value : null
  }
  const name = text('name')
  return {
    name: name ? titleCaseName(name) : null,
    phone: normalizePhone(text('phone')),
    gender: parseGender(formData.get('gender')),
    address: text('address'),
    medical_alerts: text('medical_alerts'),
    heard_from: text('heard_from'),
    // Typed as an age; kept as a birth year
    age: text('age'),
    ageWas: text('age_was'),
  }
}

type PatientInput = ReturnType<typeof readPatientForm>

// Only the name and gender are needed for a new patient; older patients without a gender can still be edited
function validate(patient: PatientInput, isNew = false): string | null {
  if (!patient.name) return 'Please enter the patient’s name.'
  if (isNew && !patient.gender) return 'Please choose the patient’s gender.'
  if (patient.phone && !isValidPhone(patient.phone)) return 'Please enter a 10-digit mobile number.'
  if (patient.age && parseAge(patient.age) === null) return 'Please enter the age in years, for example 35.'
  return null
}

// The columns to save. The birth year is worked out from the age (this year minus the age).
// On an edit it is left alone unless the age was changed, so a patient does not age by a year
// just because the form was saved.
function columnsToSave(patient: PatientInput, isNew: boolean) {
  const { age, ageWas, ...rest } = patient
  const columns: Record<string, unknown> = { ...rest }
  if (isNew || age !== ageWas) columns.birth_year = age ? birthYearFromAge(parseAge(age)!) : null
  return columns
}

// New patients go straight to their first visit
export async function createPatient(_prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  await getDoctor()
  const patient = readPatientForm(formData)
  const problem = validate(patient, true)
  if (problem) return { error: problem }

  const supabase = await createClient()
  const { data, error } = await supabase.from('patients').insert(columnsToSave(patient, true)).select('id').single()
  if (error) return { error: 'Could not save the patient. Please try again.' }

  // The visit opens at once and replaces the form in the history, so Back never returns to it
  const visitId = await findOrCreateTodaysVisit(data.id)
  revalidatePath('/app', 'layout')
  redirect(visitId ? `/app/visits/${visitId}` : `/app/patients/${data.id}`, RedirectType.replace)
}

export async function updatePatient(id: string, _prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  await getDoctor()
  const patient = readPatientForm(formData)
  const problem = validate(patient)
  if (problem) return { error: problem }

  const supabase = await createClient()
  const { error } = await supabase.from('patients').update(columnsToSave(patient, false)).eq('id', id)
  if (error) return { error: 'Could not save the changes. Please try again.' }

  revalidatePath('/app', 'layout')
  redirect(`/app/patients/${id}`)
}

// Used while typing a phone number, to spot returning patients
export async function lookupPhone(input: string) {
  await getDoctor()
  const phone = normalizePhone(input)
  if (!isValidPhone(phone)) return []
  const matches = await findPatientsByPhone(phone!)
  return matches.map((patient) => ({ id: patient.id, name: patient.name, age: patientAge(patient) }))
}

// Patients search: results while typing a name or phone number (newest patients when empty)
export async function findPatients(query: string) {
  await getDoctor()
  const patients = await searchPatients(String(query).slice(0, 60))
  return patients.map((patient) => ({
    id: patient.id,
    name: patient.name,
    detail: [formatPhone(patient.phone), patientAge(patient) !== null && `${patientAge(patient)} yrs`].filter(Boolean).join(' · ') || 'No phone',
    alert: !!patient.medical_alerts,
  }))
}
