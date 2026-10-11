import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { sumAmounts } from '@/lib/billing'

export type Due = {
  patientId: string
  patientName: string
  isTest: boolean
  amount: number
  // The most recent visit that still has a balance: where "Collect" goes
  visitId: string
}

// Patients who owe money, largest first. One query over the visits that have charges.
export async function getDues(limit = 5): Promise<Due[]> {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visits')
    .select('id, patient_id, visit_date, created_at, patient:patients!inner (name, is_test), visit_charges!inner (amount), payments (amount)')
    .order('visit_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  const byPatient = new Map<string, Due>()
  for (const row of data) {
    const patient = (Array.isArray(row.patient) ? row.patient[0] : row.patient) as { name: string; is_test: boolean }
    const total = sumAmounts((row.visit_charges ?? []).map((c) => ({ amount: Number(c.amount) })))
    const paid = sumAmounts((row.payments ?? []).map((p) => ({ amount: Number(p.amount) })))
    const balance = Math.round((total - paid) * 100) / 100
    if (balance <= 0) continue
    const existing = byPatient.get(row.patient_id)
    if (existing) {
      existing.amount = Math.round((existing.amount + balance) * 100) / 100
    } else {
      // Rows are newest first, so the first visit with a balance is the most recent
      byPatient.set(row.patient_id, {
        patientId: row.patient_id,
        patientName: patient.name,
        isTest: patient.is_test,
        amount: balance,
        visitId: row.id,
      })
    }
  }
  return [...byPatient.values()].sort((a, b) => b.amount - a.amount).slice(0, limit)
}
