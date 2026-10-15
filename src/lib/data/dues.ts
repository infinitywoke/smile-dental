import 'server-only'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { newestVisitOwing } from '@/lib/billing'
import { getAccounts } from './billing'

export type Due = {
  patientId: string
  patientName: string
  // What the patient owes, all visits together (patientAccount's `owed`)
  amount: number
  // The newest visit that still has a part owed: where "Collect" goes
  visitId: string
}

const CHUNK = 100

// Patients who owe money, largest first, by the one money rule (an advance on one visit pays the
// others). Charged and paid per visit come from the `visit_money` view; names are fetched only for
// the patients listed.
export async function getDues(limit = 5): Promise<Due[]> {
  await getDoctor()
  const supabase = await createClient()
  const accounts = await getAccounts()

  const owing = [...accounts.entries()]
    .filter(([, account]) => account.owed > 0)
    .map(([patientId, account]) => ({ patientId, amount: account.owed, visitId: newestVisitOwing(account.visits, account)! }))
    .filter((due) => due.visitId)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
  if (owing.length === 0) return []

  const names = new Map<string, string>()
  for (let i = 0; i < owing.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('patients')
      .select('id, name')
      .in('id', owing.slice(i, i + CHUNK).map((d) => d.patientId))
    if (error) throw error
    for (const row of data) names.set(row.id, row.name)
  }
  return owing.flatMap((due) => (names.has(due.patientId) ? [{ ...due, patientName: names.get(due.patientId)! }] : []))
}
