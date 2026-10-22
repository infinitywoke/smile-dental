import { lastDay } from '@/lib/insights'

// Costs: what the clinic spends, and its regular bills (supabase/stock-costs-2026-10.sql)

// Bill photos: a private folder, "<owner id>/<cost id>.<ext>"
export const BILL_BUCKET = 'cost-bills'

// The database also allows "salary"; he works alone, so it isn't offered
export const COST_CATEGORIES = [
  { value: 'stock', label: 'Supplies' },
  { value: 'lab', label: 'Lab' },
  { value: 'rent', label: 'Rent' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'internet_phone', label: 'Internet and phone' },
  { value: 'software', label: 'Software' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'repairs', label: 'Repairs' },
  { value: 'other', label: 'Other' },
] as const
export type CostCategory = (typeof COST_CATEGORIES)[number]['value']
export const isCostCategory = (value: unknown): value is CostCategory => COST_CATEGORIES.some((c) => c.value === value)
export const categoryLabel = (value: string) => COST_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other'

export const PAID_BY = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'card', label: 'Card' },
] as const
export type PaidBy = (typeof PAID_BY)[number]['value']
export const isPaidBy = (value: unknown): value is PaidBy => PAID_BY.some((p) => p.value === value)

export type Cost = {
  id: string
  spent_on: string
  category: string
  amount: number
  paid_by: PaidBy
  payee: string
  note: string
  bill_path: string | null
  fixed_cost_id: string | null
}

export type FixedCost = {
  id: string
  name: string
  category: string
  amount: number
  every: 'month' | 'year'
  // Its first due date: a monthly bill is due on this day each month, a yearly one on this day each year
  starts_on: string
  ends_on: string | null
}

// A regular bill is due in a month once it has started and until it stops; a yearly one only in its own month
export function dueIn(bill: Pick<FixedCost, 'every' | 'starts_on' | 'ends_on'>, month: string): boolean {
  if (bill.starts_on > lastDay(month)) return false
  if (bill.ends_on && bill.ends_on < `${month}-01`) return false
  return bill.every === 'month' || bill.starts_on.slice(5, 7) === month.slice(5, 7)
}

// The day it is due in that month (the 31st is the 30th in November)
export function dueOn(bill: Pick<FixedCost, 'starts_on'>, month: string): string {
  const day = Math.min(Number(bill.starts_on.slice(8, 10)), Number(lastDay(month).slice(8, 10)))
  return `${month}-${String(day).padStart(2, '0')}`
}

export type BillThisMonth = FixedCost & { due: string; paid: Cost | null }

// The regular bills due in a month, soonest first, each with what was paid for it that month
export function billsFor(bills: FixedCost[], costs: Cost[], month: string): BillThisMonth[] {
  return bills
    .filter((b) => dueIn(b, month))
    .map((b) => ({ ...b, due: dueOn(b, month), paid: costs.find((c) => c.fixed_cost_id === b.id && c.spent_on.startsWith(month)) ?? null }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name))
}

export const total = (list: { amount: number }[]) => Math.round(list.reduce((sum, c) => sum + c.amount, 0) * 100) / 100

// The month's costs by kind, biggest first
export function byCategory(costs: Pick<Cost, 'category' | 'amount'>[]): { category: string; label: string; amount: number }[] {
  const sums = new Map<string, number>()
  for (const c of costs) sums.set(c.category, (sums.get(c.category) ?? 0) + c.amount)
  return [...sums].map(([category, amount]) => ({ category, label: categoryLabel(category), amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount)
}

const ordinal = (n: number) => {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}

// "every month, on the 5th" or "every year, on 1 Apr"
export function whenDue(bill: Pick<FixedCost, 'every' | 'starts_on'>): string {
  if (bill.every === 'month') return `every month, on the ${ordinal(Number(bill.starts_on.slice(8, 10)))}`
  const date = new Date(`${bill.starts_on}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `every year, on ${date}`
}
