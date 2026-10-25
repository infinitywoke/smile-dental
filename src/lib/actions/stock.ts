'use server'

import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { parseAmount } from '@/lib/billing'
import { getTreatments } from '@/lib/data/price-list'
import { chargeName, priceListOptions } from '@/lib/pricing'
import { countDifference, formatQty, isStockKind, parseQty } from '@/lib/stock'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

type Result = { ok: true } | { ok: false; error: string }
const failed = (error: string) => ({ ok: false as const, error })
const TRY_AGAIN = 'Could not save. Please try again.'

// Saving purges every cached Clinic OS screen, so Back never shows stale data
const refresh = () => revalidatePath('/app', 'layout')

export type StockItemInput = { name: string; category: string; unit: string; lowLevel: string; supplier: string; price: string }

function readItem(input: StockItemInput) {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name) return failed('Please write what the item is called.')
  if (name.length > 100) return failed('The name is too long.')
  if (!isStockKind(input.category)) return failed('Please choose what kind of item it is.')
  const unit = input.unit.trim().toLowerCase()
  if (!unit || unit.length > 20) return failed('Please say what it is counted in: box, piece, ml…')
  const lowLevel = input.lowLevel.trim() === '' ? 0 : parseQty(input.lowLevel, { allowZero: true })
  if (lowLevel === null) return failed('Please write “Warn me at” as a number, like 2.')
  const supplier = input.supplier.trim()
  if (supplier.length > 100) return failed('The supplier’s name is too long.')
  const price = input.price.trim() === '' ? null : parseAmount(input.price)
  if (input.price.trim() !== '' && price === null) return failed('Please write the price as a number, like 120.')
  return { ok: true as const, item: { name, category: input.category, unit, low_level: lowLevel, supplier, last_unit_cost: price } }
}

const duplicate = (name: string) => failed(`“${name}” is already on the stock list.`)

// A new item, and what is on the shelf now (with its expiry, if it has one)
export async function addStockItem(input: StockItemInput, start: { qty: string; expiresOn: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await getDoctor()
  const read = readItem(input)
  if (!read.ok) return read
  const qty = start.qty.trim() === '' ? 0 : parseQty(start.qty, { allowZero: true })
  if (qty === null) return failed('Please write how many you have now as a number, like 10.')
  if (start.expiresOn && !DATE.test(start.expiresOn)) return failed('Please choose the expiry date again.')
  const supabase = await createClient()
  const { data, error } = await supabase.from('stock_items').insert(read.item).select('id').single()
  if (error) return error.code === '23505' ? duplicate(read.item.name) : failed(TRY_AGAIN)
  if (qty > 0) {
    const { error: moveError } = await supabase.from('stock_moves').insert({
      item_id: data.id, kind: 'in', qty, unit_cost: read.item.last_unit_cost, expires_on: start.expiresOn || null, note: 'Starting count',
    })
    if (moveError) {
      await supabase.from('stock_items').delete().eq('id', data.id)
      return failed(TRY_AGAIN)
    }
  }
  refresh()
  return { ok: true, id: data.id as string }
}

export async function updateStockItem(id: string, input: StockItemInput): Promise<Result> {
  await getDoctor()
  if (!UUID.test(id)) return failed(TRY_AGAIN)
  const read = readItem(input)
  if (!read.ok) return read
  const supabase = await createClient()
  const { error } = await supabase.from('stock_items').update(read.item).eq('id', id)
  if (error) return error.code === '23505' ? duplicate(read.item.name) : failed(TRY_AGAIN)
  refresh()
  return { ok: true }
}

// Off the list (its history stays). A treatment no longer takes it off stock.
export async function archiveStockItem(id: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(id)) return failed(TRY_AGAIN)
  const supabase = await createClient()
  const { error } = await supabase.from('stock_items').update({ archived: true }).eq('id', id)
  if (error) return failed('Could not remove it. Please try again.')
  await supabase.from('treatment_materials').delete().eq('item_id', id)
  refresh()
  return { ok: true }
}

// More came in: how many, at what price each, and when it expires
export async function addStock(itemId: string, input: { qty: string; price: string; expiresOn: string }): Promise<Result> {
  await getDoctor()
  if (!UUID.test(itemId)) return failed(TRY_AGAIN)
  const qty = parseQty(input.qty)
  if (qty === null) return failed('Please write how many came in, like 10.')
  const price = input.price.trim() === '' ? null : parseAmount(input.price)
  if (input.price.trim() !== '' && price === null) return failed('Please write the price as a number, like 120.')
  if (input.expiresOn && !DATE.test(input.expiresOn)) return failed('Please choose the expiry date again.')
  const supabase = await createClient()
  const { error } = await supabase.from('stock_moves').insert({ item_id: itemId, kind: 'in', qty, unit_cost: price, expires_on: input.expiresOn || null })
  if (error) return failed(TRY_AGAIN)
  if (price !== null) await supabase.from('stock_items').update({ last_unit_cost: price }).eq('id', itemId)
  refresh()
  return { ok: true }
}

// Used outside a treatment's materials, or thrown away (expired, spoilt)
export async function takeOffStock(itemId: string, input: { qty: string; wasted: boolean }): Promise<Result> {
  await getDoctor()
  if (!UUID.test(itemId)) return failed(TRY_AGAIN)
  const qty = parseQty(input.qty)
  if (qty === null) return failed('Please write how many, like 1.')
  const supabase = await createClient()
  const { error } = await supabase.from('stock_moves').insert({ item_id: itemId, kind: input.wasted ? 'waste' : 'use', qty: -qty })
  if (error) return failed(TRY_AGAIN)
  refresh()
  return { ok: true }
}

// He counted the shelf: the app takes his number, keeping the difference as the move
export async function countStock(itemId: string, counted: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(itemId)) return failed(TRY_AGAIN)
  const n = parseQty(counted, { allowZero: true })
  if (n === null) return failed('Please write how many there are, like 8.')
  const supabase = await createClient()
  // What the app has now, from the database, so an old screen can't make the count wrong
  const { data: level, error } = await supabase.from('stock_levels').select('on_hand').eq('item_id', itemId).maybeSingle()
  if (error || !level) return failed(TRY_AGAIN)
  const difference = countDifference(Number(level.on_hand), n)
  if (difference === 0) return { ok: true }
  const { error: moveError } = await supabase.from('stock_moves').insert({ item_id: itemId, kind: 'count', qty: difference, note: `Counted ${formatQty(n)}` })
  if (moveError) return failed(TRY_AGAIN)
  refresh()
  return { ok: true }
}

// Takes back a move he made here. A use from a visit's treatment comes back when that charge is removed.
export async function removeStockMove(moveId: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(moveId)) return failed(TRY_AGAIN)
  const supabase = await createClient()
  const { data, error } = await supabase.from('stock_moves').delete().eq('id', moveId).is('charge_id', null).select('id')
  if (error) return failed('Could not remove it. Please try again.')
  if (!data?.length) return failed('This came from a visit. Remove the treatment from that visit instead.')
  refresh()
  return { ok: true }
}

// What one price-list treatment uses: an item and how much. The treatment must be on the price list,
// named as a visit's bill names it, so adding it to a visit takes the item off stock.
export async function setTreatmentMaterial(input: { slug: string; description: string; itemId: string; qty: string }): Promise<Result> {
  const doctor = await getDoctor()
  if (!UUID.test(input.itemId) || !priceListOptions(await getTreatments()).some((o) => o.slug === input.slug && chargeName(o) === input.description)) return failed(TRY_AGAIN)
  const qty = parseQty(input.qty)
  if (qty === null) return failed('Please write how much one treatment uses, like 1 or 0.5.')
  const supabase = await createClient()
  const { error } = await supabase.from('treatment_materials').upsert(
    { owner_id: doctor.id, treatment_slug: input.slug, charge_description: input.description, item_id: input.itemId, qty },
    { onConflict: 'owner_id,treatment_slug,charge_description,item_id' },
  )
  if (error) return failed(TRY_AGAIN)
  refresh()
  return { ok: true }
}

// The treatment no longer takes this item off stock (what it took before stays taken)
export async function removeTreatmentMaterial(id: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(id)) return failed(TRY_AGAIN)
  const supabase = await createClient()
  const { error } = await supabase.from('treatment_materials').delete().eq('id', id)
  if (error) return failed('Could not remove it. Please try again.')
  refresh()
  return { ok: true }
}
