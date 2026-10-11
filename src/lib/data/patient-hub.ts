import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { sumAmounts } from '@/lib/billing'
import { todayInIndia } from '@/lib/dates'
import { inIndia } from '@/lib/schedule'
import { isEmptyVisit, visitStatus } from '@/lib/visit-status'
import { getPatient } from './patients'
import type { PatientSituation } from '@/lib/next-action'
import type { Patient, VisitStatus } from './types'

export type HubVisit = {
  id: string
  visit_date: string
  notes: string
  photo_count: number
  status: VisitStatus
  total: number
  balance: number
}

export type HubAppointment = { id: string; starts_at: string; reason: string }

export type PatientHub = {
  patient: Patient
  visits: HubVisit[]
  coming: HubAppointment[]
  // What the patient owes (positive) or has in advance (negative), across all visits
  balance: number
  situation: PatientSituation
}

// Everything the patient page needs, in parallel queries; time-based decisions are made here
export async function getPatientHub(id: string): Promise<PatientHub> {
  const patient = await getPatient(id)
  await getDoctor()
  const supabase = await createClient()
  const today = todayInIndia()
  const startOfToday = new Date(`${today}T00:00:00+05:30`)

  const [visitRows, appointmentRows, standalonePayments] = await Promise.all([
    supabase
      .from('visits')
      .select('id, visit_date, notes, closed_at, created_at, visit_photos (count), visit_charges (amount), payments (amount)')
      .eq('patient_id', id)
      .order('visit_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('appointments')
      .select('id, starts_at, reason, visit_id')
      .eq('patient_id', id)
      .eq('status', 'booked')
      .gte('starts_at', startOfToday.toISOString())
      .order('starts_at', { ascending: true })
      .limit(10),
    // Money received that belongs to no visit (an advance)
    supabase.from('payments').select('amount').eq('patient_id', id).is('visit_id', null),
  ])
  if (visitRows.error) throw visitRows.error
  if (appointmentRows.error) throw appointmentRows.error
  if (standalonePayments.error) throw standalonePayments.error

  // A visit with nothing in it (started, then left) is not listed
  const filled = visitRows.data.filter(
    (row) =>
      !isEmptyVisit({
        notes: row.notes,
        photos: row.visit_photos?.[0]?.count ?? 0,
        charges: row.visit_charges?.length ?? 0,
        payments: row.payments?.length ?? 0,
      }),
  )
  const visits: HubVisit[] = filled.map((row) => {
    const total = sumAmounts((row.visit_charges ?? []).map((c) => ({ amount: Number(c.amount) })))
    const paid = sumAmounts((row.payments ?? []).map((p) => ({ amount: Number(p.amount) })))
    return {
      id: row.id,
      visit_date: row.visit_date,
      notes: row.notes,
      photo_count: row.visit_photos?.[0]?.count ?? 0,
      status: visitStatus({ closedAt: row.closed_at, total, paid }),
      total,
      balance: Math.round((total - paid) * 100) / 100,
    }
  })

  const now = Date.now()
  const appointments = appointmentRows.data
  const coming = appointments
    .filter((a) => new Date(a.starts_at).getTime() > now && !a.visit_id)
    .slice(0, 3)
    .map(({ id: appointmentId, starts_at, reason }) => ({ id: appointmentId, starts_at, reason }))
  const appointmentToday = appointments.find((a) => !a.visit_id && inIndia(a.starts_at).date === today) ?? null

  const advance = sumAmounts(standalonePayments.data.map((p) => ({ amount: Number(p.amount) })))
  const balance = Math.round((sumAmounts(visits.map((v) => ({ amount: v.balance }))) - advance) * 100) / 100

  const openVisit = visitRows.data.find((row) => row.visit_date === today && !row.closed_at) ?? null
  const dueVisit = visits.find((v) => v.balance > 0) ?? null

  return {
    patient,
    visits,
    coming,
    balance,
    situation: {
      patientId: id,
      openVisit: openVisit ? { id: openVisit.id, hasNotes: openVisit.notes.trim().length > 0 } : null,
      appointmentToday: appointmentToday ? { id: appointmentToday.id } : null,
      due: dueVisit ? { visitId: dueVisit.id, amount: balance > 0 ? Math.min(dueVisit.balance, balance) : dueVisit.balance } : null,
      hasFutureAppointment: coming.length > 0,
    },
  }
}
