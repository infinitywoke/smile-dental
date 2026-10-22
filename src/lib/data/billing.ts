import 'server-only'
import { notFound } from 'next/navigation'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { patientAccount, summarise, visitMoneyOf, type BillSummary, type PatientAccount, type VisitMoney } from '@/lib/billing'
import { usualCharges, type UsualCharge } from '@/lib/usual-charges'
import type { Payment, VisitCharge } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGE = 1000
const CHUNK = 100
const MONEY_COLUMNS = 'visit_id, patient_id, visit_date, created_at, charged, paid'

type MoneyRow = { visit_id: string; patient_id: string; visit_date: string; created_at: string; charged: number | string; paid: number | string }

export type Account = PatientAccount & { visits: VisitMoney[] }

// Money per visit from the `visit_money` view (charged and paid summed by the database), grouped by
// patient, with the one money rule applied (patientAccount in src/lib/billing.ts). All patients when
// `patientIds` is left out. Supabase returns at most 1000 rows a call, so it reads page by page.
export async function getAccounts(patientIds?: string[]): Promise<Map<string, Account>> {
  await getDoctor()
  const supabase = await createClient()
  const rows: MoneyRow[] = []
  const groups = patientIds ? Array.from({ length: Math.ceil(patientIds.length / CHUNK) }, (_, i) => patientIds.slice(i * CHUNK, (i + 1) * CHUNK)) : [null]
  for (const ids of groups) {
    for (let from = 0; ; from += PAGE) {
      let query = supabase.from('visit_money').select(MONEY_COLUMNS)
      if (ids) query = query.in('patient_id', ids)
      const { data, error } = await query.order('visit_id').range(from, from + PAGE - 1)
      if (error) throw error
      rows.push(...(data as MoneyRow[]))
      if (data.length < PAGE) break
    }
  }

  const byPatient = new Map<string, MoneyRow[]>()
  for (const row of rows) byPatient.set(row.patient_id, [...(byPatient.get(row.patient_id) ?? []), row])
  const accounts = new Map<string, Account>()
  for (const [patientId, patientRows] of byPatient) {
    const visits = visitMoneyOf(patientRows)
    accounts.set(patientId, { ...patientAccount(visits), visits })
  }
  return accounts
}

export const NO_ACCOUNT: Account = { owed: 0, dueByVisit: new Map(), visits: [] }

export type VisitBill = {
  visit: { id: string; visit_date: string }
  patient: { id: string; name: string; phone: string | null }
  charges: Pick<VisitCharge, 'id' | 'description' | 'amount' | 'kind'>[]
  payments: Pick<Payment, 'id' | 'amount' | 'method' | 'received_at'>[]
  // This visit's lines, the other visits together, and what the patient owes (`due`, all visits)
  summary: BillSummary
}

// Everything the bill screen needs: this visit's charges and payments, plus the patient's account
// (what they owe, or have in advance, across all visits), so the card, the amount box and the
// WhatsApp message say the same as Today and the patient page.
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

  const [charges, payments, accounts] = await Promise.all([
    supabase.from('visit_charges').select('id, description, amount, kind').eq('visit_id', visitId).order('created_at'),
    supabase.from('payments').select('id, amount, method, received_at').eq('visit_id', visitId).order('received_at'),
    getAccounts([patient.id]),
  ])
  for (const result of [charges, payments]) if (result.error) throw result.error

  const visitCharges = charges.data!.map((c) => ({ ...c, amount: Number(c.amount) }))
  const visitPayments = payments.data!.map((p) => ({ ...p, amount: Number(p.amount) }))
  const owed = (accounts.get(patient.id) ?? NO_ACCOUNT).owed

  return {
    visit: { id: visit.id, visit_date: visit.visit_date },
    patient,
    charges: visitCharges,
    payments: visitPayments,
    summary: summarise({ charges: visitCharges, payments: visitPayments, owed }),
  }
}

// The visit's usual charges: the price-list items billed most in the last six months (src/lib/usual-charges.ts)
const USUAL_WINDOW_DAYS = 182

export async function getUsualCharges(): Promise<UsualCharge[]> {
  await getDoctor()
  const supabase = await createClient()
  const since = new Date(Date.now() - USUAL_WINDOW_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase.from('visit_charges').select('description').not('treatment_slug', 'is', null).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(PAGE)
  if (error) return usualCharges([])
  const counts = new Map<string, number>()
  for (const row of data) counts.set(row.description, (counts.get(row.description) ?? 0) + 1)
  return usualCharges([...counts].map(([description, count]) => ({ description, count })))
}
