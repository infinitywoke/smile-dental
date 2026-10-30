'use server'

import { revalidatePath } from 'next/cache'
import { getClinicId, getDoctor } from '@/lib/auth'
import { isBillFile } from '@/lib/clinic-files'
import { createClient } from '@/lib/supabase/server'
import { parseAmount } from '@/lib/billing'
import { todayInIndia } from '@/lib/dates'
import { BILL_BUCKET, isCostCategory, isPaidBy } from '@/lib/costs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

type Result = { ok: true } | { ok: false; error: string }
const failed = (error: string) => ({ ok: false as const, error })
const TRY_AGAIN = 'Could not save. Please try again.'

// Saving purges every cached Clinic OS screen, so Back never shows stale data
const refresh = () => revalidatePath('/app', 'layout')

const readAmount = (text: string) => {
  const amount = parseAmount(text)
  return amount && amount > 0 ? amount : null
}
const paidOnOk = (date: string) => DATE.test(date) && date <= todayInIndia()

export type CostInput = { id: string; amount: string; category: string; spentOn: string; paidBy: string; payee: string; note: string; billPath: string | null }

// A cost he paid. The id comes from the phone (its bill photo is stored under it first), so saving
// twice never records it twice.
export async function addCost(input: CostInput): Promise<Result> {
  const doctor = await getDoctor()
  if (!UUID.test(input.id)) return failed(TRY_AGAIN)
  const amount = readAmount(input.amount)
  if (amount === null) return failed('Please write the amount, like 1200.')
  if (!isCostCategory(input.category)) return failed('Please choose what it was for.')
  if (!paidOnOk(input.spentOn)) return failed('Please choose the day it was paid: today or before.')
  if (!isPaidBy(input.paidBy)) return failed('Please choose how it was paid.')
  const payee = input.payee.trim()
  if (payee.length > 100) return failed('The name is too long.')
  const note = input.note.trim()
  if (note.length > 300) return failed('The note is too long.')
  if (input.billPath !== null && !isBillFile(input.billPath, input.id, [await getClinicId(), doctor.id])) return failed(TRY_AGAIN)
  const supabase = await createClient()
  const { error } = await supabase.from('costs').upsert({
    id: input.id, amount, category: input.category, spent_on: input.spentOn, paid_by: input.paidBy, payee, note, bill_path: input.billPath,
  }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) return failed(TRY_AGAIN)
  refresh()
  return { ok: true }
}

// Gone, with its bill photo. Stock that came in on it stays.
export async function deleteCost(id: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(id)) return failed(TRY_AGAIN)
  const supabase = await createClient()
  const { data, error } = await supabase.from('costs').delete().eq('id', id).select('bill_path')
  if (error) return failed('Could not delete it. Please try again.')
  const path = data?.[0]?.bill_path as string | null | undefined
  if (path) await supabase.storage.from(BILL_BUCKET).remove([path])
  refresh()
  return { ok: true }
}

export type FixedCostInput = { name: string; category: string; amount: string; every: string; firstDue: string }

function readFixed(input: FixedCostInput) {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name) return failed('Please write what the bill is, like Clinic rent.')
  if (name.length > 100) return failed('The name is too long.')
  if (!isCostCategory(input.category)) return failed('Please choose what kind of bill it is.')
  const amount = readAmount(input.amount)
  if (amount === null) return failed('Please write the usual amount, like 15000.')
  if (input.every !== 'month' && input.every !== 'year') return failed('Please choose every month or every year.')
  if (!DATE.test(input.firstDue)) return failed('Please choose when it is due.')
  return { ok: true as const, bill: { name, category: input.category, amount, every: input.every, starts_on: input.firstDue } }
}

// A regular bill: rent, electricity, software. It is due on the day of `firstDue`, every month or year.
export async function addFixedCost(input: FixedCostInput): Promise<Result> {
  await getDoctor()
  const read = readFixed(input)
  if (!read.ok) return read
  const supabase = await createClient()
  const { error } = await supabase.from('fixed_costs').insert(read.bill)
  if (error) return failed(TRY_AGAIN)
  refresh()
  return { ok: true }
}

export async function updateFixedCost(id: string, input: FixedCostInput): Promise<Result> {
  await getDoctor()
  if (!UUID.test(id)) return failed(TRY_AGAIN)
  const read = readFixed(input)
  if (!read.ok) return read
  const supabase = await createClient()
  const { error } = await supabase.from('fixed_costs').update(read.bill).eq('id', id)
  if (error) return failed(TRY_AGAIN)
  refresh()
  return { ok: true }
}

// No more of this bill from today. One never due yet is simply deleted; what was paid stays either way.
export async function stopFixedCost(id: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(id)) return failed(TRY_AGAIN)
  const today = todayInIndia()
  const supabase = await createClient()
  const { data: bill } = await supabase.from('fixed_costs').select('starts_on').eq('id', id).maybeSingle()
  if (!bill) return failed(TRY_AGAIN)
  const { error } = bill.starts_on > today
    ? await supabase.from('fixed_costs').delete().eq('id', id)
    : await supabase.from('fixed_costs').update({ ends_on: today }).eq('id', id)
  if (error) return failed('Could not stop it. Please try again.')
  refresh()
  return { ok: true }
}

// This month's payment of a regular bill (the amount can differ, as electricity does). Once a month only.
export async function markBillPaid(billId: string, input: { id: string; amount: string; paidBy: string; spentOn: string }): Promise<Result> {
  await getDoctor()
  if (!UUID.test(billId) || !UUID.test(input.id)) return failed(TRY_AGAIN)
  const amount = readAmount(input.amount)
  if (amount === null) return failed('Please write the amount paid, like 2400.')
  if (!isPaidBy(input.paidBy)) return failed('Please choose how it was paid.')
  if (!paidOnOk(input.spentOn)) return failed('Please choose the day it was paid: today or before.')
  const supabase = await createClient()
  const { data: bill } = await supabase.from('fixed_costs').select('name, category').eq('id', billId).maybeSingle()
  if (!bill) return failed(TRY_AGAIN)
  const { error } = await supabase.from('costs').upsert({
    id: input.id, fixed_cost_id: billId, category: bill.category, amount, paid_by: input.paidBy, payee: bill.name, spent_on: input.spentOn,
  }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) return failed(error.code === '23505' ? `${bill.name} is already marked paid for that month.` : TRY_AGAIN)
  refresh()
  return { ok: true }
}
