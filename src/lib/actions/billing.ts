'use server'

import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { MAX_AMOUNT, sumAmounts } from '@/lib/billing'
import { formatRupees } from '@/lib/pricing'

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

// A charge or payment carries an id made on the phone, one per intended charge or payment. If the
// row was saved but the reply was lost, trying again finds that id already there: success, not a second row.
const ALREADY_SAVED = '23505'

// A discount is typed as the amount off ("Discount (Senior citizen)", ₹500) and kept as a line of its
// own below zero, so every total and due takes it off. It can't be more than the bill as it stands.
export async function addCharge(
  visitId: string,
  input: { description: string; amount: number; treatmentSlug: string | null; discount?: boolean },
  chargeId?: string,
): Promise<Result> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Something went wrong. Please reopen the visit.' }
  if (chargeId !== undefined && !UUID.test(chargeId)) return { error: 'Something went wrong. Please reopen the visit.' }
  const description = input.description.trim().slice(0, 200)
  if (!description) return { error: 'Please say what the charge is for.' }
  const discount = input.discount === true
  if (!validAmount(input.amount, !discount)) return { error: discount ? 'Please enter the discount in rupees.' : 'Please enter a valid amount.' }

  const patientId = await patientOfVisit(visitId)
  if (!patientId) return { error: 'That visit was not found.' }

  const supabase = await createClient()
  if (discount) {
    // A retry of one already saved is fine (its own amount is in the bill now)
    const { data: lines } = await supabase.from('visit_charges').select('id, amount').eq('visit_id', visitId)
    const others = (lines ?? []).filter((l) => l.id !== chargeId)
    const bill = sumAmounts(others.map((l) => ({ amount: Number(l.amount) })))
    if (input.amount > bill) return { error: `The discount can't be more than the bill (${formatRupees(Math.max(bill, 0))}).` }
  }
  const { error } = await supabase.from('visit_charges').insert({
    ...(chargeId ? { id: chargeId } : {}),
    visit_id: visitId,
    patient_id: patientId,
    description,
    amount: discount ? -input.amount : input.amount,
    kind: discount ? 'discount' : input.treatmentSlug ? 'item' : 'extra',
    treatment_slug: discount ? null : input.treatmentSlug,
  })
  if (error && !(chargeId && error.code === ALREADY_SAVED)) return { error: discount ? 'Could not add the discount. Please try again.' : 'Could not add the charge. Please try again.' }
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
export async function recordPayment(visitId: string, amount: number, method: 'upi' | 'cash', paymentId?: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Something went wrong. Please reopen the visit.' }
  if (paymentId !== undefined && !UUID.test(paymentId)) return { error: 'Something went wrong. Please reopen the visit.' }
  if (method !== 'upi' && method !== 'cash') return { error: 'Please choose UPI or cash.' }
  if (!validAmount(amount, false)) return { error: 'Please enter the amount received.' }

  const patientId = await patientOfVisit(visitId)
  if (!patientId) return { error: 'That visit was not found.' }

  const supabase = await createClient()
  const { error } = await supabase.from('payments').insert({
    ...(paymentId ? { id: paymentId } : {}),
    patient_id: patientId,
    visit_id: visitId,
    amount,
    method,
  })
  if (error && !(paymentId && error.code === ALREADY_SAVED)) return { error: 'Could not record the payment. Please try again.' }
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
