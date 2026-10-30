'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'
import { getDoctor } from '@/lib/auth'
import { todayInIndia } from '@/lib/dates'
import { getClinicTreatments, PRICE_LIST_TAG } from '@/lib/data/price-list'
import { planStockImport } from '@/lib/stock-import'
import { createClient } from '@/lib/supabase/server'

const failed = (error: string) => ({ ok: false as const, error })
const TRY_AGAIN = 'Could not load it. Please try again.'
// Each step is saved whole, and loading again skips what is already in, so a second try finishes the job
const PARTLY = 'Only part of it was loaded. Tap Load again to finish: what is already in is left as it is.'

// The spreadsheet's rows as the phone read them (the plan is worked out again here, never taken from the phone)
const Sheets = z.record(z.string().max(100), z.array(z.array(z.string().max(1000)).max(30)).max(2000))
  .refine((sheets) => Object.keys(sheets).length <= 20)

// prices: the price list's options when the Treatments sheet replaced it, else null
export type LoadResult = { ok: true; items: number; bills: number; treatments: number; prices: number | null } | { ok: false; error: string }

// Loads the "Stock and costs" spreadsheet: new stock items with their starting counts, regular bills, and
// what each treatment uses, and the price list (the Treatments sheet replaces it, for the website too).
// Items and bills already in Clinic OS are left as they are.
export async function loadStockSpreadsheet(input: unknown): Promise<LoadResult> {
  await getDoctor()
  const parsed = Sheets.safeParse(input)
  if (!parsed.success) return failed('This file couldn’t be read. Please pick it again.')
  const supabase = await createClient()
  const [items, bills, materials, priceList] = await Promise.all([
    supabase.from('stock_items').select('id, name, unit').eq('archived', false),
    supabase.from('fixed_costs').select('name').is('ends_on', null),
    supabase.from('treatment_materials').select('charge_description, item_id, qty'),
    getClinicTreatments(),
  ])
  if (items.error || bills.error || materials.error) return failed(TRY_AGAIN)
  const nameOf = new Map(items.data.map((i) => [i.id as string, i.name as string]))
  const plan = planStockImport(parsed.data, {
    items: items.data,
    bills: bills.data.map((b) => b.name),
    materials: materials.data.filter((m) => nameOf.has(m.item_id)).map((m) => ({ description: m.charge_description, item: nameOf.get(m.item_id)!, qty: Number(m.qty) })),
    priceList,
  }, todayInIndia())
  if (!plan.found) return failed('This isn’t the Stock and costs spreadsheet.')

  // The price list first, whole or not at all (the materials below are matched to it); the website and
  // Clinic OS read it again at once
  if (plan.priceList) {
    const { error } = await supabase.rpc('replace_price_list', { p_items: plan.priceList.rows })
    if (error) return failed(TRY_AGAIN)
    updateTag(PRICE_LIST_TAG)
  }

  // New items, then what is on the shelf now (both or neither)
  const ids = new Map(items.data.map((i) => [i.name, i.id as string]))
  if (plan.items.length > 0) {
    const { data, error } = await supabase.from('stock_items').insert(plan.items.map((i) => ({
      name: i.name, category: i.category, unit: i.unit, low_level: i.lowLevel, supplier: i.supplier, last_unit_cost: i.price,
    }))).select('id, name')
    if (error) return failed(error.code === '23505' ? 'Some of these items were just added to the stock list. Pick the file again to see what is new.' : TRY_AGAIN)
    for (const row of data) ids.set(row.name, row.id)
    const counted = plan.items.filter((i) => i.qty > 0)
    if (counted.length > 0) {
      const { error: moveError } = await supabase.from('stock_moves').insert(counted.map((i) => ({
        item_id: ids.get(i.name), kind: 'in', qty: i.qty, unit_cost: i.price, expires_on: i.expiresOn, note: 'Starting count',
      })))
      if (moveError) {
        await supabase.from('stock_items').delete().in('id', data.map((row) => row.id))
        return failed(TRY_AGAIN)
      }
    }
  }

  if (plan.bills.length > 0) {
    const { error } = await supabase.from('fixed_costs').insert(plan.bills.map((b) => ({
      name: b.name, category: b.category, amount: b.amount, every: b.every, starts_on: b.startsOn,
    })))
    if (error) {
      revalidatePath('/app', 'layout')
      return failed(plan.items.length > 0 ? PARTLY : TRY_AGAIN)
    }
  }

  // The same treatment and item again sets how much it uses
  const uses = plan.materials.filter((m) => ids.has(m.item))
  if (uses.length > 0) {
    const { error } = await supabase.from('treatment_materials').upsert(
      uses.map((m) => ({ treatment_slug: m.slug, charge_description: m.description, item_id: ids.get(m.item), qty: m.qty })),
      { onConflict: 'clinic_id,treatment_slug,charge_description,item_id' },
    )
    if (error) {
      revalidatePath('/app', 'layout')
      return failed(plan.items.length + plan.bills.length > 0 ? PARTLY : TRY_AGAIN)
    }
  }

  revalidatePath('/app', 'layout')
  return { ok: true, items: plan.items.length, bills: plan.bills.length, treatments: new Set(uses.map((m) => m.description)).size, prices: plan.priceList?.rows.length ?? null }
}
