import 'server-only'
import { notFound } from 'next/navigation'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { addDays, blockInstant, blocksFor, BLOCK_MINUTES, inIndia } from '@/lib/schedule'
import type { BookingRequest } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MINUTE = 60_000

export type BlockState = 'free' | 'booked' | 'request' | 'blocked' | 'past'

// One 40-minute block of a day, ready to draw
export type DayBlock = {
  time: string // HH:MM, India time
  instant: string // ISO
  state: BlockState
  appointmentId?: string
  patientId?: string
  patientName?: string
  isTest?: boolean
  reason?: string
  requestId?: string
  requestName?: string
  note?: string
}

export type DaySchedule = {
  date: string
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
  patient: { id: string; name: string; phone: string | null; is_test: boolean; medical_alerts: string | null }
}

const APPOINTMENT_SELECT = 'id, patient_id, starts_at, duration_min, reason, status, patient:patients!inner (id, name, phone, is_test, medical_alerts)'

function dayRange(date: string) {
  const start = new Date(blockInstant(date, '00:00'))
  return { start, end: new Date(start.getTime() + 24 * 60 * MINUTE) }
}

// A day laid out as clinic blocks: what's booked, requested, blocked off, or free
export async function getDaySchedule(date: string): Promise<DaySchedule> {
  await getDoctor()
  const supabase = await createClient()
  const { start, end } = dayRange(date)
  const iso = { from: start.toISOString(), to: end.toISOString() }

  const [appointments, timeOff, requests] = await Promise.all([
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
  ])
  if (appointments.error) throw appointments.error
  if (timeOff.error) throw timeOff.error
  if (requests.error) throw requests.error

  const now = Date.now()
  const rows = appointments.data as unknown as AppointmentRow[]
  const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd

  const blocks: DayBlock[] = blocksFor(date).map((time) => {
    const instant = blockInstant(date, time)
    const s = new Date(instant).getTime()
    const e = s + BLOCK_MINUTES * MINUTE
    const block: DayBlock = { time, instant, state: 'free' }

    const appt = rows.find((a) => {
      const as = new Date(a.starts_at).getTime()
      return overlaps(as, as + a.duration_min * MINUTE, s, e)
    })
    if (appt) {
      return {
        ...block,
        state: 'booked',
        appointmentId: appt.id,
        patientId: appt.patient_id,
        patientName: appt.patient.name,
        isTest: appt.patient.is_test,
        reason: appt.reason,
      }
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
  })

  const dayOff = timeOff.data.some(
    (t) => new Date(t.starts_at).getTime() <= start.getTime() && new Date(t.ends_at).getTime() >= end.getTime(),
  )
  return { date, closed: blocksFor(date).length === 0, blocks, dayOff }
}

// Number of booked appointments per day, for the day strip
export async function getBusyCounts(from: string, days: number): Promise<Record<string, number>> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointments')
    .select('starts_at')
    .eq('status', 'booked')
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

export async function getPendingRequests(): Promise<BookingRequest[]> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('status', 'new')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as BookingRequest[]
}

export async function getBookingRequest(id: string): Promise<BookingRequest> {
  await getDoctor()
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()
  const { data, error } = await supabase.from('booking_requests').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) notFound()
  return data as BookingRequest
}
