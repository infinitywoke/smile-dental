'use server'

import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { BLOCK_MINUTES, blockInstant, clinicBlockOf } from '@/lib/schedule'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { confirmationMessage, declineMessage, movedMessage, whatsappLink } from '@/lib/whatsapp'
import { parseGender } from '@/lib/gender'
import { patientAge, titleCaseName } from '@/lib/patient-fields'
import { findPatientsByPhone, searchPatients } from '@/lib/data/patients'
import { getDaySchedule, type DaySchedule } from '@/lib/data/appointments'

type Result = { error?: string }
type WithWhatsapp = Result & { whatsappUrl?: string; appointmentId?: string; patientId?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function refresh() {
  revalidatePath('/app', 'layout')
}

const parseBlock = clinicBlockOf

// The database's messages are written for the doctor; anything else gets a generic line
function messageOf(error: { code?: string; message: string } | null, fallback: string): string {
  if (error && (error.code === 'P0001' || error.code === '23P01')) {
    return error.code === '23P01' ? 'That time is already booked. Please choose another block.' : error.message
  }
  return fallback
}

// Save on the request screen: patient + appointment + request marked booked, all or nothing.
// Returns the patient's WhatsApp confirmation, ready for one tap on Send.
export async function confirmBookingRequest(requestId: string, startsAt: string, patientId: string | null): Promise<WithWhatsapp> {
  await getDoctor()
  if (!UUID.test(requestId) || (patientId && !UUID.test(patientId))) return { error: 'Something went wrong. Please reopen the request.' }
  const block = parseBlock(startsAt)
  if (!block) return { error: 'Please choose one of the clinic time blocks.' }

  const supabase = await createClient()
  const { data: request, error: requestError } = await supabase
    .from('booking_requests')
    .select('name, phone')
    .eq('id', requestId)
    .maybeSingle()
  if (requestError || !request) return { error: 'That request was not found.' }

  const { data, error } = await supabase.rpc('confirm_booking_request', {
    p_request: requestId,
    p_starts_at: block.iso,
    p_patient: patientId,
  })
  if (error) return { error: messageOf(error, 'Could not save. Please try again.') }

  const row = (Array.isArray(data) ? data[0] : data) as { patient_id: string; appointment_id: string } | null
  refresh()
  return {
    patientId: row?.patient_id,
    appointmentId: row?.appointment_id,
    whatsappUrl: whatsappLink(request.phone, confirmationMessage({ name: request.name, startsAt: block.iso })),
  }
}

// "Can't fit that time": marks the request declined and prepares a polite WhatsApp
export async function declineBookingRequest(requestId: string): Promise<WithWhatsapp> {
  await getDoctor()
  if (!UUID.test(requestId)) return { error: 'Something went wrong. Please reopen the request.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_requests')
    .update({ status: 'declined' })
    .eq('id', requestId)
    .eq('status', 'new')
    .select('name, phone')
    .maybeSingle()
  if (error) return { error: 'Could not decline the request. Please try again.' }
  if (!data) return { error: 'This request has already been handled.' }
  refresh()
  return { whatsappUrl: whatsappLink(data.phone, declineMessage({ name: data.name })) }
}

// Phone booking from the calendar for a patient already in the app
export async function bookAppointment(
  patientId: string,
  startsAt: string,
  reason: string,
  fromVisitId?: string,
): Promise<WithWhatsapp> {
  await getDoctor()
  if (!UUID.test(patientId)) return { error: 'Something went wrong. Please try again.' }
  if (fromVisitId && !UUID.test(fromVisitId)) return { error: 'Invalid visit.' }
  const block = parseBlock(startsAt)
  if (!block) return { error: 'Please choose one of the clinic time blocks.' }

  const supabase = await createClient()
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('name, phone')
    .eq('id', patientId)
    .maybeSingle()
  if (patientError || !patient) return { error: 'That patient was not found.' }

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_id: patientId,
      starts_at: block.iso,
      duration_min: BLOCK_MINUTES,
      reason: reason.trim(),
      status: 'booked',
      from_visit_id: fromVisitId || null,
    })
    .select('id')
    .single()
  if (error) return { error: messageOf(error, 'Could not book the appointment. Please try again.') }

  refresh()
  return {
    appointmentId: data.id,
    patientId,
    whatsappUrl: patient.phone ? whatsappLink(patient.phone, confirmationMessage({ name: patient.name, startsAt: block.iso })) : undefined,
  }
}

// Phone booking for someone not in the app yet: just a name and number
export async function bookNewPatient(input: { name: string; phone: string; gender?: string; reason: string }, startsAt: string): Promise<WithWhatsapp> {
  await getDoctor()
  const name = input.name.trim()
  const phone = normalizePhone(input.phone)
  if (!name) return { error: 'Please enter the patient’s name.' }
  if (phone && !isValidPhone(phone)) return { error: 'Please enter a 10-digit mobile number.' }
  const gender = parseGender(input.gender)
  if (!gender) return { error: 'Please choose the patient’s gender.' }
  const block = parseBlock(startsAt)
  if (!block) return { error: 'Please choose one of the clinic time blocks.' }

  const supabase = await createClient()
  const { data: patient, error } = await supabase
    .from('patients')
    .insert({ name: titleCaseName(name), phone, gender })
    .select('id')
    .single()
  if (error) return { error: 'Could not save the patient. Please try again.' }

  const booked = await bookAppointment(patient.id, block.iso, input.reason)
  if (booked.error) {
    // Don't leave a patient with no appointment behind
    await supabase.from('patients').delete().eq('id', patient.id)
    return booked
  }
  return booked
}

export async function cancelAppointment(appointmentId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(appointmentId)) return { error: 'Something went wrong.' }
  const supabase = await createClient()
  const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appointmentId).eq('status', 'booked')
  if (error) return { error: 'Could not cancel the appointment.' }
  refresh()
  return {}
}

export async function moveAppointment(appointmentId: string, startsAt: string): Promise<WithWhatsapp> {
  await getDoctor()
  if (!UUID.test(appointmentId)) return { error: 'Something went wrong.' }
  const block = parseBlock(startsAt)
  if (!block) return { error: 'Please choose one of the clinic time blocks.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointments')
    .update({ starts_at: block.iso, duration_min: BLOCK_MINUTES })
    .eq('id', appointmentId)
    .eq('status', 'booked')
    .select('id, patient:patients!inner (name, phone)')
    .maybeSingle()
  if (error) return { error: messageOf(error, 'Could not move the appointment.') }
  if (!data) return { error: 'That appointment was not found.' }

  const patient = data.patient as unknown as { name: string; phone: string | null }
  refresh()
  return {
    appointmentId,
    whatsappUrl: patient.phone ? whatsappLink(patient.phone, movedMessage({ name: patient.name, startsAt: block.iso })) : undefined,
  }
}

// Search as you type on the booking page: name or phone
export async function findPatientsToBook(query: string) {
  await getDoctor()
  const patients = await searchPatients(String(query).slice(0, 60))
  return patients.slice(0, 8).map((p) => ({
    id: p.id, name: p.name, phone: p.phone, age: patientAge(p),
  }))
}

// Block time off: one block, or a whole day (holiday). Hidden from the website.
export async function blockTime(startsAt: string, endsAt: string, note: string): Promise<Result> {
  await getDoctor()
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return { error: 'Please check the time.' }
  const supabase = await createClient()
  const { error } = await supabase.from('time_off').insert({ starts_at: start.toISOString(), ends_at: end.toISOString(), note: note.trim() })
  if (error) return { error: 'Could not block that time.' }
  refresh()
  return {}
}

export async function blockDay(date: string): Promise<Result> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Please check the date.' }
  const start = blockInstant(date, '00:00')
  const end = new Date(new Date(start).getTime() + 24 * 60 * 60_000).toISOString()
  return blockTime(start, end, 'Closed')
}

// Reopen a blocked block or day: removes the time off that covers this moment
export async function unblockTime(startsAt: string): Promise<Result> {
  await getDoctor()
  const at = new Date(startsAt)
  if (Number.isNaN(at.getTime())) return { error: 'Please check the time.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('time_off')
    .delete()
    .lte('starts_at', at.toISOString())
    .gt('ends_at', at.toISOString())
  if (error) return { error: 'Could not reopen that time.' }
  refresh()
  return {}
}

// One tap from Today: book the time the patient asked for. Links to the patient already in the app
// when the same phone and name exist; otherwise creates them. (Family sharing a phone stay separate.)
export async function confirmRequestAsAsked(requestId: string): Promise<WithWhatsapp> {
  await getDoctor()
  if (!UUID.test(requestId)) return { error: 'Something went wrong. Please reopen the request.' }

  const supabase = await createClient()
  const { data: request } = await supabase
    .from('booking_requests')
    .select('name, phone, requested_start, status')
    .eq('id', requestId)
    .maybeSingle()
  if (!request) return { error: 'That request was not found.' }
  if (request.status !== 'new') return { error: 'This request has already been handled.' }
  if (!request.requested_start) return { error: 'No time was asked for. Please choose a time.' }

  const sameName = (await findPatientsByPhone(request.phone)).filter(
    (p) => p.name.trim().toLowerCase() === request.name.trim().toLowerCase(),
  )
  return confirmBookingRequest(requestId, request.requested_start, sameName.length === 1 ? sameName[0].id : null)
}

export async function getScheduleForDate(date: string): Promise<DaySchedule> {
  await getDoctor()
  return getDaySchedule(date)
}
