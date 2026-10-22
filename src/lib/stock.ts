import { formatDate } from '@/lib/dates'
import { formatRupees } from '@/lib/pricing'
import { addDays } from '@/lib/schedule'

// Stock: what the clinic keeps (supabase/stock-costs-2026-10.sql). How much is on hand is the sum of
// its moves: in (+), use and waste (-), and a count correction (the difference the count found).

export const STOCK_KINDS = [
  { value: 'consumable', label: 'Consumable' },
  { value: 'medicine', label: 'Medicine' },
  { value: 'material', label: 'Material' },
  { value: 'instrument', label: 'Instrument' },
  { value: 'other', label: 'Other' },
] as const
export type StockKind = (typeof STOCK_KINDS)[number]['value']
export const isStockKind = (value: unknown): value is StockKind => STOCK_KINDS.some((k) => k.value === value)

// Offered as chips when adding an item; any short word works
export const COMMON_UNITS = ['piece', 'box', 'pack', 'capsule', 'syringe', 'ml'] as const

// One row of the stock_levels view
export type StockLevel = {
  item_id: string
  name: string
  category: StockKind
  unit: string
  // At or below this, it shows as low (0: never)
  low_level: number
  supplier: string
  last_unit_cost: number | null
  on_hand: number
  // The soonest expiry still to come among what came in
  next_expiry: string | null
}

export type StockMove = {
  id: string
  kind: 'in' | 'use' | 'count' | 'waste'
  qty: number
  unit_cost: number | null
  expires_on: string | null
  note: string
  moved_at: string
  // Taken off by a charge on a visit: it comes back when the charge is removed, not from here
  charge_id: string | null
}

// What one price-list treatment uses (treatment_materials), matched on the charge's name
export type TreatmentMaterial = { id: string; treatment_slug: string; charge_description: string; item_id: string; qty: number }

// What expires within this many days is flagged
export const EXPIRY_WARNING_DAYS = 30

export const isLow = (s: Pick<StockLevel, 'on_hand' | 'low_level'>) => s.low_level > 0 && s.on_hand <= s.low_level

export const expiresSoon = (nextExpiry: string | null, today: string) =>
  nextExpiry !== null && nextExpiry <= addDays(today, EXPIRY_WARNING_DAYS)

// Low first, then what expires soon, then by name
export function sortStock<T extends StockLevel>(levels: T[], today: string): T[] {
  const rank = (s: StockLevel) => (isLow(s) ? 0 : expiresSoon(s.next_expiry, today) ? 1 : 2)
  return [...levels].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

// For the Cockpit and the morning: how many things need buying or checking
export function stockAlerts(levels: StockLevel[], today: string): { low: number; expiring: number } {
  return { low: levels.filter(isLow).length, expiring: levels.filter((s) => expiresSoon(s.next_expiry, today)).length }
}

// 12 → "12", 2.5 → "2.5"
export const formatQty = (n: number) => String(Math.round(n * 100) / 100)

const NO_PLURAL = new Set(['ml', 'l', 'g', 'mg', 'kg', 'mm', 'cm', 'm'])

// "box" → "boxes", "capsule" → "capsules", "ml" stays "ml"
export function pluralUnit(unit: string): string {
  const u = unit.trim()
  if (NO_PLURAL.has(u.toLowerCase()) || /s$/i.test(u) || !/[a-z]$/i.test(u)) return u
  if (/(x|ch|sh)$/i.test(u)) return `${u}es`
  if (/[^aeiou]y$/i.test(u)) return `${u.slice(0, -1)}ies`
  return `${u}s`
}

// "1 box", "3 boxes", "2.5 ml"
export const qtyWithUnit = (n: number, unit: string) => `${formatQty(n)} ${Math.abs(n) === 1 ? unit : pluralUnit(unit)}`

// What he typed as an amount of stock: up to two decimals, above 0 (or 0 too, when counting)
export function parseQty(text: string, { allowZero = false } = {}): number | null {
  const t = text.trim().replace(',', '.')
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n > 0 || (allowZero && n === 0) ? n : null
}

// A count sets what is on the shelf; the move is the difference (0: it already matches)
export const countDifference = (onHand: number, counted: number) => Math.round((counted - onHand) * 100) / 100

// What one treatment's materials cost at their last prices; `complete` is false when one has no price yet
export function materialsCost(uses: { item_id: string; qty: number }[], levels: StockLevel[]): { amount: number; complete: boolean } {
  let amount = 0
  let complete = true
  for (const use of uses) {
    const price = levels.find((l) => l.item_id === use.item_id)?.last_unit_cost ?? null
    if (price === null) complete = false
    else amount += use.qty * price
  }
  return { amount: Math.round(amount * 100) / 100, complete }
}

// One line of an item's history, in words
export function moveLine(move: Pick<StockMove, 'kind' | 'qty' | 'unit_cost' | 'expires_on' | 'note' | 'charge_id'>, unit: string): string {
  const amount = qtyWithUnit(Math.abs(move.qty), unit)
  switch (move.kind) {
    case 'in': {
      const each = move.unit_cost !== null ? ` at ${formatRupees(move.unit_cost)} each` : ''
      const expiry = move.expires_on ? `, expires ${formatDate(move.expires_on)}` : ''
      return `Added ${amount}${each}${expiry}`
    }
    case 'use':
      return move.charge_id && move.note ? `Used ${amount} for ${move.note}` : `Used ${amount}`
    case 'waste':
      return `Thrown away ${amount}`
    case 'count':
      return `Counted: ${amount} ${move.qty > 0 ? 'more' : 'fewer'} than the app had`
  }
}
