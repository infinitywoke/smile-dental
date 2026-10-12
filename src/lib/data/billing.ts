import 'server-only'
import { notFound } from 'next/navigation'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { summarise, sumAmounts, type BillSummary } from '@/lib/billing'
import type { Payment, VisitCharge } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type VisitBill = {
  visit: { id: string; visit_date: string }
  patient: { id: string; name: string; phone: string | null }
  charges: Pick<VisitCharge, 'id' | 'description' | 'amount' | 'kind'>[]
  payments: Pick<Payment, 'id' | 'amount' | 'method' | 'received_at'>[]
  summary: BillSummary
}

// Everything the bill screen needs: this visit's charges and payments, plus what the patient owes
// from their other visits (shown as "Other visits"; earlier or later, so the total due is always right)
export async function getVisitBill(visitId: string): Promise<VisitBill> {
  await getDoctor()
  if (!UUID.test(visitId)) notFound()
  const supabase = await createClient()

  const { data: visit, error } = await supabase
    .from('visits')
    .select('id, visit_date, patient:patients!inner (id, name, phone)')
    .eq('id', visitId)
    .maybeSingle()
  if (error) throw error
  if (!visit) notFound()
  const patient = visit.patient as unknown as VisitBill['patient']

  const [charges, payments, allCharges, allPayments] = await Promise.all([
    supabase.from('visit_charges').select('id, description, amount, kind').eq('visit_id', visitId).order('created_at'),
    supabase.from('payments').select('id, amount, method, received_at').eq('visit_id', visitId).order('received_at'),
    supabase.from('visit_charges').select('amount').eq('patient_id', patient.id),
    supabase.from('payments').select('amount').eq('patient_id', patient.id),
  ])
  for (const result of [charges, payments, allCharges, allPayments]) if (result.error) throw result.error

  const visitCharges = charges.data!.map((c) => ({ ...c, amount: Number(c.amount) }))
  const visitPayments = payments.data!.map((p) => ({ ...p, amount: Number(p.amount) }))
  const everything = sumAmounts(allCharges.data!.map((c) => ({ amount: Number(c.amount) }))) -
    sumAmounts(allPayments.data!.map((p) => ({ amount: Number(p.amount) })))
  const thisVisit = sumAmounts(visitCharges) - sumAmounts(visitPayments)
  const earlier = Math.round((everything - thisVisit) * 100) / 100

  return {
    visit: { id: visit.id, visit_date: visit.visit_date },
    patient,
    charges: visitCharges,
    payments: visitPayments,
    summary: summarise({ charges: visitCharges, payments: visitPayments, earlier }),
  }
}
