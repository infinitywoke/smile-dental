'use server'

import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { MAX_AMOUNT } from '@/lib/billing'

type Result = { error?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function refresh() {
  revalidatePath('/app', 'layout')
}

function validAmount(amount: number, allowZero: boolean): boolean {
  if (!Number.isFinite(amount) || amount > MAX_AMOUNT) return false
  // Whole paise only
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) return false
  return allowZero ? amount >= 0 : amount > 0
}

// The patient is always taken from the visit, never from the screen
async function patientOfVisit(visitId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('visits').select('patient_id').eq('id', visitId).maybeSingle()
  return data?.patient_id ?? null
}

export async function addCharge(
  visitId: string,
  input: { description: string; amount: number; treatmentSlug: string | null },
): Promise<Result> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Something went wrong. Please reopen the visit.' }
  const description = input.description.trim().slice(0, 200)
  if (!description) return { error: 'Please say what the charge is for.' }
  if (!validAmount(input.amount, true)) return { error: 'Please enter a valid amount.' }

  const patientId = await patientOfVisit(visitId)
  if (!patientId) return { error: 'That visit was not found.' }

  const supabase = await createClient()
  const { error } = await supabase.from('visit_charges').insert({
    visit_id: visitId,
    patient_id: patientId,
    description,
    amount: input.amount,
    kind: input.treatmentSlug ? 'item' : 'extra',
    treatment_slug: input.treatmentSlug,
  })
  if (error) return { error: 'Could not add the charge. Please try again.' }
  refresh()
  return {}
}

export async function removeCharge(chargeId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(chargeId)) return { error: 'Something went wrong.' }
  const supabase = await createClient()
  const { error } = await supabase.from('visit_charges').delete().eq('id', chargeId)
  if (error) return { error: 'Could not remove the charge.' }
  refresh()
  return {}
}

// Money received. Confirmed by the doctor himself: tapped after the UPI alert or counting the cash.
export async function recordPayment(visitId: string, amount: number, method: 'upi' | 'cash'): Promise<Result> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Something went wrong. Please reopen the visit.' }
  if (method !== 'upi' && method !== 'cash') return { error: 'Please choose UPI or cash.' }
  if (!validAmount(amount, false)) return { error: 'Please enter the amount received.' }

  const patientId = await patientOfVisit(visitId)
  if (!patientId) return { error: 'That visit was not found.' }

  const supabase = await createClient()
  const { error } = await supabase.from('payments').insert({
    patient_id: patientId,
    visit_id: visitId,
    amount,
    method,
    kind: 'payment',
  })
  if (error) return { error: 'Could not record the payment. Please try again.' }
  refresh()
  return {}
}

export async function removePayment(paymentId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(paymentId)) return { error: 'Something went wrong.' }
  const supabase = await createClient()
  const { error } = await supabase.from('payments').delete().eq('id', paymentId)
  if (error) return { error: 'Could not remove the payment.' }
  refresh()
  return {}
}
