'use server'

import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { BLOCK_MINUTES, DEFAULT_LENGTH, blockInstant, clinicBlockOf, clinicStartOf, formatTimeOf, isLength, lengthLabel } from '@/lib/schedule'
import { isValidPhone, normalizePhone } from '@/lib/phone'
import { confirmationMessage, declineMessage, messageLanguage, movedMessage, whatsappLink } from '@/lib/whatsapp'
import { parseGender } from '@/lib/gender'
import { patientAge, titleCaseName } from '@/lib/patient-fields'
import { findPatientsByPhone, namesList, searchPatients, withSameName } from '@/lib/data/patients'
import { getBusyCounts, getDaySchedule, getDaysOff, type DaySchedule } from '@/lib/data/appointments'

type Result = { error?: string }
type WithWhatsapp = Result & {
  whatsappUrl?: string
  appointmentId?: string
  patientId?: string
  // The time actually booked (a retry can find the request booked at another time)
  startsAt?: string
  // The request had been declined (a retry, or another tab): whatsappUrl is the decline message
  declined?: boolean
  // One-tap Confirm: the phone already belongs to someone, so the doctor chooses on the request page
  needsChoice?: string
  // New patient by phone: patients already using that number (nothing was saved)
  matches?: { id: string; name: string; age: number | null }[]
}
type Supabase = Awaited<ReturnType<typeof createClient>>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MINUTE = 60_000

function refresh() {
  revalidatePath('/app', 'layout')
}

const parseBlock = clinicBlockOf

// A start for an appointment of `minutes` (Clinic OS: 20-minute grid, within a session)
function startFor(startsAt: string, minutes: number) {
  return clinicStartOf(startsAt, minutes)
}
const clinicLength = (n: number) => (isLength(n) ? n : DEFAULT_LENGTH)
const DOESNT_FIT = (minutes: number) => `A ${lengthLabel(minutes)} appointment doesn't fit there. Please choose another time or a shorter length.`

// The database's messages are written for the doctor; anything else gets a generic line
function messageOf(error: { code?: string; message: string } | null, fallback: string): string {
  if (error && (error.code === 'P0001' || error.code === '23P01')) {
    return error.code === '23P01' ? 'That time is already booked. Please choose another block.' : error.message
  }
  return fallback
}

const HANDLED = 'This request has already been handled.'

// A request that was handled already (a retry after a lost reply, or an old card in another tab).
// Hands back what the doctor still needs: the confirmation for the time actually booked, or the
// decline message. Null when there is nothing left to send.
async function handledResult(supabase: Supabase, requestId: string): Promise<WithWhatsapp | null> {
  const { data: request } = await supabase
    .from('booking_requests')
    .select('name, phone, status, patient_id, appointment_id')
    .eq('id', requestId)
    .maybeSingle()
  if (!request) return null
  if (request.status === 'declined') {
    return { declined: true, whatsappUrl: whatsappLink(request.phone, declineMessage({ name: request.name })) }
  }
  if (request.status !== 'booked' || !request.appointment_id) return null
  const { data: appointment } = await supabase
    .from('appointments')
    .select('starts_at, status')
    .eq('id', request.appointment_id)
    .maybeSingle()
  if (!appointment || appointment.status !== 'booked') return null
  return {
    patientId: request.patient_id ?? undefined,
    appointmentId: request.appointment_id,
    startsAt: appointment.starts_at,
    whatsappUrl: whatsappLink(request.phone, confirmationMessage({ name: request.name, startsAt: appointment.starts_at })),
  }
}

// Save on the request screen: patient + appointment + request marked booked, all or nothing.
// Returns the patient's WhatsApp confirmation, ready for one tap on Send. Safe to repeat: once the
// request is booked, it returns the confirmation for that booking again.
export async function confirmBookingRequest(
  requestId: string,
  startsAt: string,
  patientId: string | null,
  minutes: number = DEFAULT_LENGTH,
): Promise<WithWhatsapp> {
  await getDoctor()
  if (!UUID.test(requestId) || (patientId && !UUID.test(patientId))) return { error: 'Something went wrong. Please reopen the request.' }
  const block = startFor(startsAt, minutes)
  if (!block) return { error: DOESNT_FIT(minutes) }

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
    p_minutes: minutes,
  })
  if (error) {
    if (error.message === HANDLED) {
      const handled = await handledResult(supabase, requestId)
      if (handled) return handled
    }
    return { error: messageOf(error, 'Could not save. Please try again.') }
  }

  const row = (Array.isArray(data) ? data[0] : data) as { patient_id: string; appointment_id: string } | null
  refresh()
  return {
    patientId: row?.patient_id,
    appointmentId: row?.appointment_id,
    startsAt: block.iso,
    whatsappUrl: whatsappLink(request.phone, confirmationMessage({ name: request.name, startsAt: block.iso })),
  }
}

// "Can't fit that time": marks the request declined and prepares a polite WhatsApp. Safe to repeat.
export async function declineBookingRequest(requestId: string): Promise<WithWhatsapp> {
  await getDoctor()
  if (!UUID.test(requestId)) return { error: 'Something went wrong. Please reopen the request.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_requests')
    .update({ status: 'declined' })
    .eq('id', requestId)
    .in('status', ['new', 'contacted'])
    .select('name, phone')
    .maybeSingle()
  if (error) return { error: 'Could not decline the request. Please try again.' }
  if (!data) {
    const handled = await handledResult(supabase, requestId)
    if (handled?.declined) return handled
    return { error: handled ? 'This request is booked already. To cancel it, open the patient.' : HANDLED }
  }
  refresh()
  return { declined: true, whatsappUrl: whatsappLink(data.phone, declineMessage({ name: data.name })) }
}

// Phone booking from the calendar for a patient already in the app
export async function bookAppointment(
  patientId: string,
  startsAt: string,
  reason: string,
  minutes: number = DEFAULT_LENGTH,
): Promise<WithWhatsapp> {
  await getDoctor()
  if (!UUID.test(patientId)) return { error: 'Something went wrong. Please try again.' }
  const block = startFor(startsAt, minutes)
  if (!block) return { error: DOESNT_FIT(minutes) }

  const supabase = await createClient()
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('name, phone, language')
    .eq('id', patientId)
    .maybeSingle()
  if (patientError || !patient) return { error: 'That patient was not found.' }

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_id: patientId,
      starts_at: block.iso,
      duration_min: minutes,
      reason: reason.trim(),
      status: 'booked',
    })
    .select('id')
    .single()
  let appointmentId: string | undefined = data?.id
  if (error) {
    // A retry after a lost reply clashes with its own booking: that is the booking, not an error
    const { data: own } = error.code === '23P01'
      ? await supabase.from('appointments').select('id').eq('patient_id', patientId).eq('starts_at', block.iso).eq('status', 'booked').maybeSingle()
      : { data: null }
    if (!own) return { error: messageOf(error, 'Could not book the appointment. Please try again.') }
    appointmentId = own.id
  }

  refresh()
  return {
    appointmentId,
    patientId,
    startsAt: block.iso,
    whatsappUrl: patient.phone ? whatsappLink(patient.phone, confirmationMessage({ name: patient.name, startsAt: block.iso, language: messageLanguage(patient.language) })) : undefined,
  }
}

// Phone booking for someone not in the app yet: just a name and number. When the number is already
// in the app, nothing is saved: the screen shows who has it ("Book <name>" or "Someone new", since
// family members share phones), and `someoneNew` is set when the doctor says it is someone else.
export async function bookNewPatient(
  input: { name: string; phone: string; gender?: string; reason: string },
  startsAt: string,
  someoneNew = false,
  minutes: number = DEFAULT_LENGTH,
): Promise<WithWhatsapp> {
  await getDoctor()
  const name = input.name.trim()
  const phone = normalizePhone(input.phone)
  if (!name) return { error: 'Please enter the patient’s name.' }
  if (phone && !isValidPhone(phone)) return { error: 'Please enter a 10-digit mobile number.' }
  const gender = parseGender(input.gender)
  if (!gender) return { error: 'Please choose the patient’s gender.' }
  const block = startFor(startsAt, minutes)
  if (!block) return { error: DOESNT_FIT(minutes) }

  if (phone && !someoneNew) {
    const known = await findPatientsByPhone(phone)
    if (known.length > 0) return { matches: known.map((p) => ({ id: p.id, name: p.name, age: patientAge(p) })) }
  }

  const supabase = await createClient()
  const { data: patient, error } = await supabase
    .from('patients')
    .insert({ name: titleCaseName(name), phone, gender })
    .select('id')
    .single()
  if (error) return { error: 'Could not save the patient. Please try again.' }

  const booked = await bookAppointment(patient.id, block.iso, input.reason, minutes)
  if (booked.error) {
    // Don't leave a patient with no appointment behind
    await supabase.from('patients').delete().eq('id', patient.id)
    return booked
  }
  return booked
}

// Cancel frees the time. The screen then offers the patient a WhatsApp message
// (/app/appointments/<id>/cancelled). Safe to repeat.
export async function cancelAppointment(appointmentId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(appointmentId)) return { error: 'Something went wrong.' }
  const supabase = await createClient()
  const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appointmentId).eq('status', 'booked')
  if (error) return { error: 'Could not cancel the appointment.' }
  refresh()
  return {}
}

// Moves an appointment to another time, and to another length if he chose one (else it keeps its own)
export async function moveAppointment(appointmentId: string, startsAt: string, minutes?: number): Promise<WithWhatsapp> {
  await getDoctor()
  if (!UUID.test(appointmentId)) return { error: 'Something went wrong.' }

  const supabase = await createClient()
  const { data: current } = await supabase.from('appointments').select('duration_min').eq('id', appointmentId).maybeSingle()
  if (!current) return { error: 'That appointment was not found.' }
  const length = minutes === undefined ? current.duration_min : clinicLength(minutes)
  const block = startFor(startsAt, length)
  if (!block) return { error: DOESNT_FIT(length) }

  const { data, error } = await supabase
    .from('appointments')
    .update({ starts_at: block.iso, duration_min: length })
    .eq('id', appointmentId)
    .eq('status', 'booked')
    .select('id, patient:patients!inner (name, phone, language)')
    .maybeSingle()
  if (error) return { error: messageOf(error, 'Could not move the appointment.') }
  if (!data) return { error: 'That appointment was not found.' }

  const patient = data.patient as unknown as { name: string; phone: string | null; language: string | null }
  refresh()
  return {
    appointmentId,
    whatsappUrl: patient.phone ? whatsappLink(patient.phone, movedMessage({ name: patient.name, startsAt: block.iso, language: messageLanguage(patient.language) })) : undefined,
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

// Why this time can't be blocked off yet: patients booked in it (they would come to a closed
// clinic) or website requests waiting for it (they could never be confirmed). Null when it is clear.
// What is already over, or a patient already seen (their visit is open), doesn't count.
async function calendarClash(supabase: Supabase, start: Date, end: Date, wholeDay: boolean): Promise<string | null> {
  const now = Date.now()
  const overlaps = (s: number, minutes: number) =>
    s < end.getTime() && start.getTime() < s + minutes * MINUTE && now < s + minutes * MINUTE
  const [appointments, requests] = await Promise.all([
    supabase
      .from('appointments')
      .select('starts_at, duration_min, patient:patients!inner (name)')
      .is('visit_id', null)
      .eq('status', 'booked')
      // An appointment lasts at most 8 hours
      .gte('starts_at', new Date(start.getTime() - 8 * 60 * MINUTE).toISOString())
      .lt('starts_at', end.toISOString())
      .order('starts_at'),
    supabase
      .from('booking_requests')
      .select('name, requested_start')
      .in('status', ['new', 'contacted'])
      .gte('requested_start', new Date(start.getTime() - BLOCK_MINUTES * MINUTE).toISOString())
      .lt('requested_start', end.toISOString())
      .order('requested_start'),
  ])
  if (appointments.error || requests.error) return 'Could not check the calendar. Please try again.'

  const booked = (appointments.data as unknown as { starts_at: string; duration_min: number; patient: { name: string } }[])
    .filter((a) => overlaps(new Date(a.starts_at).getTime(), a.duration_min))
  const waiting = (requests.data as { name: string; requested_start: string }[])
    .filter((r) => overlaps(new Date(r.requested_start).getTime(), BLOCK_MINUTES))
  if (booked.length === 0 && waiting.length === 0) return null

  const where = wholeDay ? 'on this day' : 'at this time'
  const then = wholeDay ? 'then close the day' : 'then block the time'
  const lines: string[] = []
  if (booked.length > 0) {
    const who = namesList(booked.map((a) => `${a.patient.name} (${formatTimeOf(a.starts_at)})`))
    lines.push(`${who} ${booked.length === 1 ? 'is' : 'are'} booked ${where}. Move or cancel first, ${then}.`)
  }
  if (waiting.length > 0) {
    const who = namesList(waiting.map((r) => `${r.name} (${formatTimeOf(r.requested_start)})`))
    const asks = waiting.length === 1 ? `A website request from ${who} is` : `Website requests from ${who} are`
    lines.push(`${asks} waiting ${where}. Decline ${waiting.length === 1 ? 'it' : 'them'} on Today first${booked.length > 0 ? '' : `, ${then}`}.`)
  }
  return lines.join(' ')
}

async function addTimeOff(start: Date, end: Date, note: string, wholeDay: boolean): Promise<Result> {
  const supabase = await createClient()
  const clash = await calendarClash(supabase, start, end, wholeDay)
  if (clash) return { error: clash }
  const { error } = await supabase.from('time_off').insert({ starts_at: start.toISOString(), ends_at: end.toISOString(), note: note.trim() })
  if (error) return { error: 'Could not block that time.' }
  refresh()
  return {}
}

// Block time off: one block, or a whole day (holiday). Hidden from the website. Refused while a
// patient is booked in it or a website request is waiting for it.
export async function blockTime(startsAt: string, endsAt: string, note: string): Promise<Result> {
  await getDoctor()
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return { error: 'Please check the time.' }
  return addTimeOff(start, end, note, false)
}

function dayBounds(date: string) {
  const start = new Date(blockInstant(date, '00:00'))
  return { start, end: new Date(start.getTime() + 24 * 60 * MINUTE) }
}

export async function blockDay(date: string): Promise<Result> {
  await getDoctor()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Please check the date.' }
  const { start, end } = dayBounds(date)
  return addTimeOff(start, end, 'Closed', true)
}

// Reopen one blocked block: removes only time off that lies inside that block. A block inside a
// closed day stays closed (the screen offers "Reopen the day" instead).
export async function unblockTime(startsAt: string): Promise<Result> {
  await getDoctor()
  const block = parseBlock(startsAt)
  if (!block) return { error: 'Please check the time.' }
  const start = block.iso
  const end = new Date(new Date(start).getTime() + BLOCK_MINUTES * MINUTE).toISOString()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('time_off')
    .delete()
    .gte('starts_at', start)
    .lte('ends_at', end)
    .select('id')
  if (error) return { error: 'Could not reopen that time.' }
  if (data.length === 0) {
    // Nothing of its own to remove: either reopened already (a retry), or part of longer time off
    const { data: longer } = await supabase.from('time_off').select('id').lt('starts_at', end).gt('ends_at', start).limit(1)
    if (longer && longer.length > 0) return { error: 'This time is part of longer time off, so it can’t be reopened on its own.' }
  }
  refresh()
  return {}
}

// Reopen a closed day: removes the time off that covers the whole day, nothing else
export async function reopenDay(date: string): Promise<Result> {
  await getDoctor()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Please check the date.' }
  const { start, end } = dayBounds(date)
  const supabase = await createClient()
  const { error } = await supabase
    .from('time_off')
    .delete()
    .lte('starts_at', start.toISOString())
    .gte('ends_at', end.toISOString())
  if (error) return { error: 'Could not reopen the day.' }
  refresh()
  return {}
}

// One tap from Today: book the time the patient asked for. Links to the patient already in the app
// when exactly one patient has the same phone and name. When the phone belongs to anyone else, it
// saves nothing and sends the doctor to the request page to choose (family members share phones).
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
  if (request.status !== 'new' && request.status !== 'contacted') {
    return (await handledResult(supabase, requestId)) ?? { error: HANDLED }
  }
  if (!request.requested_start) return { error: 'No time was asked for. Please choose a time.' }

  const samePhone = await findPatientsByPhone(request.phone)
  const sameName = withSameName(request.name, samePhone)
  if (sameName.length === 1) return confirmBookingRequest(requestId, request.requested_start, sameName[0].id)
  if (samePhone.length > 0) return { needsChoice: `This number belongs to ${namesList(samePhone.map((p) => p.name))}.` }
  return confirmBookingRequest(requestId, request.requested_start, null)
}

export async function getScheduleForDate(date: string, length: number = DEFAULT_LENGTH): Promise<DaySchedule> {
  await getDoctor()
  return getDaySchedule(date, clinicLength(length))
}

// A month on the calendar: how many are booked each day, and the days blocked off whole
export type CalendarMonth = { booked: Record<string, number>; daysOff: string[] }
export async function getCalendarMonth(month: string): Promise<CalendarMonth> {
  await getDoctor()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { booked: {}, daysOff: [] }
  const [y, m] = month.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const [booked, daysOff] = await Promise.all([getBusyCounts(`${month}-01`, days), getDaysOff(`${month}-01`, days)])
  return { booked, daysOff }
}
