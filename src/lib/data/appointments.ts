import 'server-only'
import { notFound } from 'next/navigation'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ALL_BLOCKS, BLOCK_MINUTES, DEFAULT_LENGTH, SLOT_MINUTES, addDays, blockInstant, blocksFor, inIndia, isClinicStart, startsFor } from '@/lib/schedule'
import { requestNotice, type RequestNotice } from '@/lib/request-hold'
import type { BookingRequest } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MINUTE = 60_000

export type BlockState = 'free' | 'booked' | 'request' | 'blocked' | 'past'

// One start time of a day for the chosen length (30 minutes unless chosen), ready to draw
export type DayBlock = {
  time: string // HH:MM, India time
  instant: string // ISO
  state: BlockState
  appointmentId?: string
  patientId?: string
  patientName?: string
  reason?: string
  requestId?: string
  requestName?: string
  note?: string
}

export type DaySchedule = {
  date: string
  // The appointment length the times were worked out for, in minutes
  length: number
  closed: boolean // Friday
  blocks: DayBlock[]
  // Whole day taken off by the doctor (holiday)
  dayOff: boolean
}

export type AppointmentRow = {
  id: string
  patient_id: string
  starts_at: string
  duration_min: number
  reason: string
  status: string
  // The visit started from this appointment, if any
  visit_id: string | null
  // Where it is: shown when the clinic has more than one chair or dentist
  chair: { name: string } | null
  dentist: { name: string; short_name: string | null } | null
  patient: { id: string; name: string; phone: string | null; medical_alerts: string | null; language: string | null }
}

const APPOINTMENT_SELECT = 'id, patient_id, starts_at, duration_min, reason, status, visit_id, chair:chairs (name), dentist:dentists (name, short_name), patient:patients!inner (id, name, phone, medical_alerts, language)'

function dayRange(date: string) {
  const start = new Date(blockInstant(date, '00:00'))
  return { start, end: new Date(start.getTime() + 24 * 60 * MINUTE) }
}

// A day laid out for an appointment of `length` minutes: what's booked, requested, blocked off, or free.
// The half-hour block starts (8:30, 9:00 ...) always show. So that no minutes are lost after an
// appointment of another length, the moment something ends (9:45 after a 45-minute appointment at 9:00)
// shows too, when it is free and the block start before it isn't.
export async function getDaySchedule(date: string, length: number = DEFAULT_LENGTH): Promise<DaySchedule> {
  await getDoctor()
  const supabase = await createClient()
  const { start, end } = dayRange(date)
  const iso = { from: start.toISOString(), to: end.toISOString() }

  const [appointments, timeOff, requests, chairs] = await Promise.all([
    supabase
      .from('appointments')
      .select(APPOINTMENT_SELECT)
      .eq('status', 'booked')
      .gte('starts_at', new Date(start.getTime() - 3 * 60 * MINUTE).toISOString())
      .lt('starts_at', iso.to),
    supabase.from('time_off').select('id, starts_at, ends_at, note').lt('starts_at', iso.to).gt('ends_at', iso.from),
    supabase
      .from('booking_requests')
      .select('id, name, requested_start')
      .eq('status', 'new')
      .gte('requested_start', iso.from)
      .lt('requested_start', iso.to),
    supabase.from('chairs').select('id', { count: 'exact', head: true }).eq('active', true),
  ])
  if (appointments.error) throw appointments.error
  if (timeOff.error) throw timeOff.error
  if (requests.error) throw requests.error

  const now = Date.now()
  const rows = appointments.data as unknown as AppointmentRow[]
  const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd

  // A time is taken once every chair is (with one chair, by the first appointment there)
  const chairsInUse = Math.max(chairs.count ?? 1, 1)

  // What a stretch of time holds, from the first thing found: an appointment, a request, time off, the past
  const stateOf = (time: string, minutes: number): DayBlock => {
    const instant = blockInstant(date, time)
    const s = new Date(instant).getTime()
    const e = s + minutes * MINUTE
    const block: DayBlock = { time, instant, state: 'free' }
    const there = rows.filter((a) => {
      const as = new Date(a.starts_at).getTime()
      return overlaps(as, as + a.duration_min * MINUTE, s, e)
    })
    const appt = there.length >= chairsInUse ? there[0] : undefined
    if (appt) {
      return { ...block, state: 'booked', appointmentId: appt.id, patientId: appt.patient_id, patientName: appt.patient.name, reason: appt.reason }
    }
    const req = requests.data.find((r) => {
      const rs = new Date(r.requested_start!).getTime()
      return overlaps(rs, rs + BLOCK_MINUTES * MINUTE, s, e)
    })
    if (req) return { ...block, state: 'request', requestId: req.id, requestName: req.name }
    const off = timeOff.data.find((t) => overlaps(new Date(t.starts_at).getTime(), new Date(t.ends_at).getTime(), s, e))
    if (off) return { ...block, state: 'blocked', note: off.note }
    if (s < now) return { ...block, state: 'past' }
    return block
  }

  const fits = (time: string) => isClinicStart(date, time, length)
  // Where something ends that day (an appointment, a request's block, time off), as India times
  const ends = [
    ...rows.map((a) => new Date(a.starts_at).getTime() + a.duration_min * MINUTE),
    ...requests.data.map((r) => new Date(r.requested_start!).getTime() + BLOCK_MINUTES * MINUTE),
    ...timeOff.data.map((t) => new Date(t.ends_at).getTime()),
  ].map((ms) => inIndia(new Date(ms))).filter((t) => t.date === date).map((t) => t.time)
  const grid = startsFor(date, SLOT_MINUTES)
  const times = [...new Set([...grid, ...ends])].sort()
  const blocks: DayBlock[] = []
  for (const time of times) {
    if (ALL_BLOCKS.includes(time)) {
      // A block start: what is there now (its own 30 minutes); "free" only if the whole length fits
      const own = stateOf(time, BLOCK_MINUTES)
      if (own.state !== 'free') blocks.push(own)
      else if (fits(time)) {
        const whole = stateOf(time, length)
        if (whole.state === 'free') blocks.push(whole)
      }
    } else if (fits(time)) {
      // Something ends here: only when it fills a gap the block start before it can't
      const here = stateOf(time, length)
      const before = grid.filter((g) => g < time).pop()
      const beforeFree = before !== undefined && fits(before) && stateOf(before, length).state === 'free'
      if (here.state === 'free' && !beforeFree) blocks.push(here)
    }
  }

  const dayOff = timeOff.data.some(
    (t) => new Date(t.starts_at).getTime() <= start.getTime() && new Date(t.ends_at).getTime() >= end.getTime(),
  )
  return { date, length, closed: blocksFor(date).length === 0, blocks, dayOff }
}

// The days blocked off whole (a holiday the doctor took), from one day for so many days
export async function getDaysOff(from: string, days: number): Promise<string[]> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('time_off')
    .select('starts_at, ends_at')
    .lt('starts_at', dayRange(addDays(from, days)).start.toISOString())
    .gt('ends_at', dayRange(from).start.toISOString())
  if (error) throw error
  return Array.from({ length: days }, (_, i) => addDays(from, i)).filter((date) => {
    const { start, end } = dayRange(date)
    return data.some((t) => new Date(t.starts_at).getTime() <= start.getTime() && new Date(t.ends_at).getTime() >= end.getTime())
  })
}

// Number of booked appointments per day, for the day strip. One that already has its visit (the
// patient came; e.g. no phone, so WhatsApp never marked it done) is not counted.
export async function getBusyCounts(from: string, days: number): Promise<Record<string, number>> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointments')
    .select('starts_at')
    .eq('status', 'booked')
    .is('visit_id', null)
    .gte('starts_at', dayRange(from).start.toISOString())
    .lt('starts_at', dayRange(addDays(from, days)).start.toISOString())
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of data) {
    const { date } = inIndia(row.starts_at)
    counts[date] = (counts[date] ?? 0) + 1
  }
  return counts
}

export async function getAppointmentsOn(date: string): Promise<AppointmentRow[]> {
  await getDoctor()
  const supabase = await createClient()
  const { start, end } = dayRange(date)
  const { data, error } = await supabase
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .eq('status', 'booked')
    .gte('starts_at', start.toISOString())
    .lt('starts_at', end.toISOString())
    .order('starts_at')
  if (error) throw error
  return data as unknown as AppointmentRow[]
}

export async function getAppointment(id: string): Promise<AppointmentRow> {
  await getDoctor()
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()
  const { data, error } = await supabase.from('appointments').select(APPOINTMENT_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) notFound()
  return data as unknown as AppointmentRow
}

// The same, or null when it is gone (for pages that only mention it)
export async function findAppointment(id: string | null): Promise<AppointmentRow | null> {
  await getDoctor()
  if (!id || !UUID.test(id)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.from('appointments').select(APPOINTMENT_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data as unknown as AppointmentRow | null
}

// `confirmable`: the time asked for is still ahead, so one tap can book it.
// `notice`: "Time passed" or "No longer held, asked 2 days ago" (null while the request is held).
export type PendingRequest = BookingRequest & { confirmable: boolean; notice: RequestNotice | null; voice_url: string | null }

// Patients' voice notes are private: they play through links that last an hour
export const VOICE_BUCKET = 'request-voice'
async function voiceNoteUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const supabase = await createClient()
  const { data } = await supabase.storage.from(VOICE_BUCKET).createSignedUrls(paths, 60 * 60)
  return Object.fromEntries((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl]] : [])))
}

export async function getPendingRequests(): Promise<PendingRequest[]> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('status', 'new')
    .order('created_at', { ascending: true })
  if (error) throw error
  const now = Date.now()
  const requests = data as BookingRequest[]
  const urls = await voiceNoteUrls(requests.flatMap((r) => (r.voice_note ? [r.voice_note] : [])))
  return requests.map((request) => ({
    ...request,
    voice_url: request.voice_note ? (urls[request.voice_note] ?? null) : null,
    confirmable: !!request.requested_start && new Date(request.requested_start).getTime() > now,
    notice: requestNotice(request.requested_start, request.created_at, request.received_at, now),
  }))
}

export async function getBookingRequest(id: string): Promise<BookingRequest & { voice_url: string | null; notice: RequestNotice | null }> {
  await getDoctor()
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()
  const { data, error } = await supabase.from('booking_requests').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) notFound()
  const request = data as BookingRequest
  const urls = request.voice_note ? await voiceNoteUrls([request.voice_note]) : {}
  return {
    ...request,
    voice_url: request.voice_note ? (urls[request.voice_note] ?? null) : null,
    // Whether its time is held, as Today's card says it
    notice: requestNotice(request.requested_start, request.created_at, request.received_at, Date.now()),
  }
}
