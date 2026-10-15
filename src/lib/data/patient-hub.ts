import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { newestVisitOwing, patientAccount, sumAmounts, type VisitMoney } from '@/lib/billing'
import { todayInIndia } from '@/lib/dates'
import { inIndia } from '@/lib/schedule'
import { isEmptyVisit, visitStatus } from '@/lib/visit-status'
import { getPatient } from './patients'
import type { Patient, VisitStatus } from './types'

export type HubVisit = {
  id: string
  visit_date: string
  notes: string
  photo_count: number
  status: VisitStatus
  total: number
}

export type HubAppointment = { id: string; starts_at: string; reason: string; duration_min: number }

export type PatientHub = {
  patient: Patient
  visits: HubVisit[]
  coming: HubAppointment[]
  // What the patient owes (positive) or has in advance (negative), across all visits
  balance: number
  // The visit already started today, if any: the main button opens it instead of starting another
  todayVisitId: string | null
  // Booked for today with no visit started from it yet: the Start button passes it along
  appointmentTodayId: string | null
  // Only when something is owed: the newest visit with a part owed, and the whole amount to collect
  due: { visitId: string; amount: number } | null
}

// Everything the patient page needs, in parallel queries; time-based decisions are made here
export async function getPatientHub(id: string): Promise<PatientHub> {
  const patient = await getPatient(id)
  await getDoctor()
  const supabase = await createClient()
  const today = todayInIndia()
  const startOfToday = new Date(`${today}T00:00:00+05:30`)

  const [visitRows, appointmentRows] = await Promise.all([
    supabase
      .from('visits')
      .select('id, visit_date, notes, closed_at, resend_needed, created_at, visit_photos (count), visit_charges (amount), payments (amount)')
      .eq('patient_id', id)
      .order('visit_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('appointments')
      .select('id, starts_at, reason, visit_id, duration_min')
      .eq('patient_id', id)
      .eq('status', 'booked')
      .gte('starts_at', startOfToday.toISOString())
      .order('starts_at', { ascending: true })
      .limit(10),
  ])
  if (visitRows.error) throw visitRows.error
  if (appointmentRows.error) throw appointmentRows.error

  // The one money rule over every visit (every payment belongs to a visit)
  const money: VisitMoney[] = visitRows.data.map((row) => ({
    id: row.id,
    date: row.visit_date,
    createdAt: row.created_at,
    charged: sumAmounts((row.visit_charges ?? []).map((c) => ({ amount: Number(c.amount) }))),
    paid: sumAmounts((row.payments ?? []).map((p) => ({ amount: Number(p.amount) }))),
  }))
  const account = patientAccount(money)
  const moneyOf = new Map(money.map((m) => [m.id, m]))

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
    const { charged: total, paid } = moneyOf.get(row.id)!
    return {
      id: row.id,
      visit_date: row.visit_date,
      notes: row.notes,
      photo_count: row.visit_photos?.[0]?.count ?? 0,
      status: visitStatus({ closedAt: row.closed_at, resendNeeded: row.resend_needed, total, paid, due: account.dueByVisit.get(row.id) ?? 0 }),
      total,
    }
  })

  const now = Date.now()
  const appointments = appointmentRows.data
  const coming = appointments
    .filter((a) => new Date(a.starts_at).getTime() > now && !a.visit_id)
    .slice(0, 3)
    .map(({ id: appointmentId, starts_at, reason, duration_min }) => ({ id: appointmentId, starts_at, reason, duration_min }))
  const appointmentToday = appointments.find((a) => !a.visit_id && inIndia(a.starts_at).date === today) ?? null

  const todayVisit = visitRows.data.find((row) => row.visit_date === today) ?? null
  const dueVisitId = account.owed > 0 ? newestVisitOwing(money, account) : null

  return {
    patient,
    visits,
    coming,
    balance: account.owed,
    todayVisitId: todayVisit?.id ?? null,
    appointmentTodayId: appointmentToday?.id ?? null,
    due: dueVisitId ? { visitId: dueVisitId, amount: account.owed } : null,
  }
}
