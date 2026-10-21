import { treatments } from '@/config/site'

// A price-list cost string ("3,500/-", "45,000/- to 65,000/-", ...) parsed into numbers.
// Amounts are whole-number rupees. Anything we can't read confidently is 'unknown', never a guess.
export type Price =
  | { kind: 'fixed'; amount: number; note?: string }
  | { kind: 'range'; min: number; max: number; note?: string }
  | { kind: 'formula'; base: number; perUnit: number; text: string }
  | { kind: 'unknown'; text: string }

export type PriceListOption = {
  slug: string
  treatment: string
  detail: string
  cost: string
  price: Price
}

// One amount: plain digits, Indian grouping (1,25,000) or Western grouping (125,000),
// optionally prefixed with ₹/Rs and followed by "/-". Commas are only accepted in valid
// positions, so separate numbers can never run together into one.
const AMOUNT = String.raw`(?:₹|Rs\.?|INR)?\s*(\d{1,2}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+|\d+)\s*(?:\/-)?`
const NOTE = String.raw`(?:\s*\(([^()]*)\))?\s*\.?\s*`

const FIXED_RE = new RegExp(String.raw`^\s*${AMOUNT}${NOTE}$`, 'i')
const RANGE_RE = new RegExp(String.raw`^\s*${AMOUNT}\s*(?:to|–|—|-)\s*${AMOUNT}${NOTE}$`, 'i')
const FORMULA_RE = new RegExp(String.raw`^\s*${AMOUNT}\s*\+\s*${AMOUNT}\s*(?:\*|x|×)\s*(?:the\s+)?(?:number|no\.?)\s+of\s+[a-z ]+?\s*\.?\s*$`, 'i')

function toAmount(digits: string): number | null {
  const n = Number(digits.replace(/,/g, ''))
  return Number.isSafeInteger(n) ? n : null
}

function cleanNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim()
  return trimmed ? trimmed : undefined
}

export function parsePrice(cost: string): Price {
  const text = cost.trim()

  const formula = FORMULA_RE.exec(text)
  if (formula) {
    const base = toAmount(formula[1])
    const perUnit = toAmount(formula[2])
    if (base !== null && perUnit !== null) return { kind: 'formula', base, perUnit, text }
  }

  const range = RANGE_RE.exec(text)
  if (range) {
    const min = toAmount(range[1])
    const max = toAmount(range[2])
    if (min !== null && max !== null && min <= max) {
      const note = cleanNote(range[3])
      return note ? { kind: 'range', min, max, note } : { kind: 'range', min, max }
    }
  }

  const fixed = FIXED_RE.exec(text)
  if (fixed) {
    const amount = toAmount(fixed[1])
    if (amount !== null) {
      const note = cleanNote(fixed[2])
      return note ? { kind: 'fixed', amount, note } : { kind: 'fixed', amount }
    }
  }

  return { kind: 'unknown', text }
}

// Every priced line of the shared price list, flattened for pickers
export function priceListOptions(): PriceListOption[] {
  return treatments.flatMap((t) =>
    (t.pricing ?? []).map((p) => ({
      slug: t.slug,
      treatment: t.name,
      detail: p.detail,
      cost: p.cost,
      price: parsePrice(p.cost),
    })),
  )
}

const rupeeFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

// 125000 → "₹1,25,000"; 99.5 → "₹99.5"
export function formatRupees(n: number): string {
  if (!Number.isFinite(n)) return '₹—'
  const formatted = rupeeFormat.format(Math.abs(n))
  return n < 0 ? `-₹${formatted}` : `₹${formatted}`
}

// Short display form of a parsed price, e.g. "₹45,000–₹65,000" or "₹1,200 + ₹400 each"
export function formatPrice(price: Price): string {
  switch (price.kind) {
    case 'fixed':
      return formatRupees(price.amount)
    case 'range':
      return `${formatRupees(price.min)}–${formatRupees(price.max)}`
    case 'formula':
      return `${formatRupees(price.base)} + ${formatRupees(price.perUnit)} each`
    case 'unknown':
      return price.text
  }
}

// The website's form of a price-list cost: the short form, with its note ("₹3,499 per crown")
export function priceForPatients(cost: string): string {
  const price = parsePrice(cost)
  const note = price.kind === 'fixed' || price.kind === 'range' ? price.note : undefined
  return note ? `${formatPrice(price)} ${note.toLowerCase()}` : formatPrice(price)
}
