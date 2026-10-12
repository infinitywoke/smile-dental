import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type Due = {
  patientId: string
  patientName: string
  amount: number
  // The most recent visit that still has a balance: where "Collect" goes
  visitId: string
}

const PAGE = 1000
const CHUNK = 100

type Row = { visit_id: string; amount: number | string }

// Money owed, largest first. Only the visit and the amount are read for every charge and payment
// (no joins, no photos, no notes), summed per visit here; names and dates are fetched only for the
// visits that still owe something. Amounts are summed in whole paise.
export async function getDues(limit = 5): Promise<Due[]> {
  await getDoctor()
  const supabase = await createClient()

  // Supabase returns at most 1000 rows a call, so read page by page
  async function readAll(table: 'visit_charges' | 'payments'): Promise<Row[]> {
    const rows: Row[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select('visit_id, amount')
        .not('visit_id', 'is', null)
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw error
      rows.push(...(data as Row[]))
      if (data.length < PAGE) return rows
    }
  }
  const [charges, payments] = await Promise.all([readAll('visit_charges'), readAll('payments')])

  const owed = new Map<string, number>()
  for (const [rows, sign] of [[charges, 1], [payments, -1]] as const) {
    for (const row of rows) owed.set(row.visit_id, (owed.get(row.visit_id) ?? 0) + sign * Math.round(Number(row.amount) * 100))
  }
  const visitIds = [...owed.keys()].filter((id) => owed.get(id)! > 0)
  if (visitIds.length === 0) return []

  const visits: { id: string; patient_id: string; visit_date: string; created_at: string; patient: unknown }[] = []
  for (let i = 0; i < visitIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('visits')
      .select('id, patient_id, visit_date, created_at, patient:patients!inner (name)')
      .in('id', visitIds.slice(i, i + CHUNK))
    if (error) throw error
    visits.push(...data)
  }
  visits.sort((a, b) => b.visit_date.localeCompare(a.visit_date) || b.created_at.localeCompare(a.created_at))

  const byPatient = new Map<string, Due>()
  for (const row of visits) {
    const patient = (Array.isArray(row.patient) ? row.patient[0] : row.patient) as { name: string }
    const balance = owed.get(row.id)! / 100
    const existing = byPatient.get(row.patient_id)
    if (existing) {
      existing.amount = Math.round((existing.amount + balance) * 100) / 100
    } else {
      // Newest first, so the first visit with a balance is the most recent
      byPatient.set(row.patient_id, {
        patientId: row.patient_id,
        patientName: patient.name,
        amount: balance,
        visitId: row.id,
      })
    }
  }
  return [...byPatient.values()].sort((a, b) => b.amount - a.amount).slice(0, limit)
}
