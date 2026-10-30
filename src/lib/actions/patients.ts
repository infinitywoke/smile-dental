'use server'

import { RedirectType, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { findPatientsByPhone, searchPatients } from '@/lib/data/patients'
import { findOrCreateTodaysVisit } from '@/lib/data/visits'
import { messageLanguage } from '@/lib/whatsapp'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { formatPhone } from '@/lib/phone'
import { birthDateFrom, birthYearFromAge, parseAge, patientAge, titleCaseName } from '@/lib/patient-fields'
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
    // The date of birth, typed as day, month and year; or, when only that is known, the age
    byAge: formData.get('birth_by') === 'age',
    birthDay: text('birth_day'),
    birthMonth: text('birth_month'),
    birthYear: text('birth_year_typed'),
    birthDateWas: text('birth_date_was'),
    age: text('age'),
    ageWas: text('age_was'),
    // They agree to the clinic keeping their records; and when they agreed, before this save
    consent: formData.get('consent') === 'yes',
    consentWas: text('consent_was'),
    // The language of their WhatsApp messages, when the form asks ('kn' or 'hi', else English)
    language: formData.has('language') ? ({ en: null, kn: 'kn', hi: 'hi' } as const)[messageLanguage(String(formData.get('language')))] : undefined,
  }
}

type PatientInput = ReturnType<typeof readPatientForm>

const birthDateOf = (patient: PatientInput) => birthDateFrom(patient.birthDay, patient.birthMonth, patient.birthYear)
const birthDateTyped = (patient: PatientInput) => Boolean(patient.birthDay || patient.birthMonth || patient.birthYear)

// A new patient needs a name, a gender and their agreement to the clinic keeping their records (asked
// last); older patients without a gender can still be edited
function validate(patient: PatientInput, isNew = false): string | null {
  if (!patient.name) return 'Please enter the patient’s name.'
  if (isNew && !patient.gender) return 'Please choose the patient’s gender.'
  if (patient.phone && !isValidPhone(patient.phone)) return 'Please enter a 10-digit mobile number.'
  if (!patient.byAge && birthDateTyped(patient) && !birthDateOf(patient)) return 'Please check the date of birth: day, month and the year in 4 digits, for example 12 3 1985.'
  if (patient.byAge && patient.age && parseAge(patient.age) === null) return 'Please enter the age in years, for example 35.'
  if (isNew && !patient.consent) return 'Please ask if they agree to the clinic keeping their records, then tick it.'
  return null
}

// The columns to save. A date of birth is kept with its year as the birth year. When only the age is
// known, the birth year is worked out from it (this year minus the age); on an edit that is left alone
// unless the age was changed, so a patient does not age by a year just because the form was saved.
// Date boxes left empty change nothing, unless they held a date of birth before (then it goes).
// Agreeing keeps the time they first agreed; taking the tick off records that they withdrew.
function columnsToSave(patient: PatientInput, isNew: boolean) {
  const { byAge, birthDay, birthMonth, birthYear, birthDateWas, age, ageWas, consent, consentWas, ...rest } = patient
  const columns: Record<string, unknown> = { ...rest }
  if (rest.language === undefined) delete columns.language
  if (consent && (isNew || !consentWas)) columns.consent_at = new Date().toISOString()
  if (!consent && consentWas) columns.consent_at = null
  if (!byAge) {
    const date = birthDateFrom(birthDay, birthMonth, birthYear)
    if (date || birthDateWas) {
      columns.birth_date = date
      columns.birth_year = date ? Number(date.slice(0, 4)) : null
    }
  } else if (isNew || age !== ageWas) {
    columns.birth_date = null
    columns.birth_year = age ? birthYearFromAge(parseAge(age)!) : null
  }
  return columns
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALREADY_SAVED = '23505'

// New patients go straight to their first visit. The form sends an id made on the phone, so a save
// repeated after a lost reply finds the patient already saved and carries on, never making a second.
export async function createPatient(_prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  await getDoctor()
  const patient = readPatientForm(formData)
  const problem = validate(patient, true)
  if (problem) return { error: problem }

  const givenId = String(formData.get('patient_id') ?? '')
  const id = UUID.test(givenId) ? givenId : null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('patients')
    .insert({ ...(id ? { id } : {}), ...columnsToSave(patient, true) })
    .select('id')
    .single()
  let patientId: string | undefined = data?.id
  if (error) {
    const saved = id && error.code === ALREADY_SAVED
      ? (await supabase.from('patients').select('id').eq('id', id).maybeSingle()).data
      : null
    if (!saved) return { error: 'Could not save the patient. Please try again.' }
    patientId = saved.id
  }

  // The visit opens at once and replaces the form in the history, so Back never returns to it
  const visitId = await findOrCreateTodaysVisit(patientId!)
  revalidatePath('/app', 'layout')
  redirect(visitId ? `/app/visits/${visitId}` : `/app/patients/${patientId}`, RedirectType.replace)
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

// Asked at a visit, once, for patients added before the New patient form asked (or booked from the
// website or by phone)
export async function recordConsent(patientId: string): Promise<{ error?: string }> {
  await getDoctor()
  const supabase = await createClient()
  const { error } = await supabase.from('patients').update({ consent_at: new Date().toISOString() }).eq('id', patientId).is('consent_at', null)
  if (error) return { error: 'Could not save. Please try again.' }
  revalidatePath('/app', 'layout')
  return {}
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
