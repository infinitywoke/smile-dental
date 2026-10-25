import { homeServices, toothAreas, type HomeService, type ToothArea, type Treatment } from '@/config/site'
import { formatRupees, parsePrice } from '@/lib/pricing'

// The clinic's price list lives in the database (price_list; the stock spreadsheet's Treatments sheet
// replaces it), one row per priced option in the list's order. Until a sheet is loaded it is empty and the
// list written into the app (src/config/site.ts `treatments`) is used.

export type PriceRow = { slug: string; treatment: string; description: string; detail: string; cost: string }

// Rows (in order) as treatments with their priced options; a treatment's description is on its first row
export function treatmentsFrom(rows: PriceRow[]): Treatment[] {
  const bySlug = new Map<string, Treatment>()
  for (const row of rows) {
    const known = bySlug.get(row.slug)
    if (known) known.pricing!.push({ detail: row.detail, cost: row.cost })
    else bySlug.set(row.slug, { slug: row.slug, name: row.treatment, shortDescription: row.description, isVerified: true, pricing: [{ detail: row.detail, cost: row.cost }] })
  }
  return [...bySlug.values()]
}

export function rowsFrom(list: Treatment[]): PriceRow[] {
  return list.flatMap((t) => (t.pricing ?? []).map((p, i) => ({ slug: t.slug, treatment: t.name, description: i === 0 ? t.shortDescription : '', detail: p.detail, cost: p.cost })))
}

// A treatment's address on the website: "Crowns & Bridges (Ceramic)" -> "crowns-bridges-ceramic"
export const slugFor = (name: string) =>
  name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'treatment'

// ---- Prices in the website's words, worked out from the list so they always follow it ----
// "{fillings|3M Ketac Molar GIC}" is that option's price ("₹700"), ":max" the top of a range, ":per" the
// price per extra unit; "{fillings}" the lowest price of the treatment. A price the list no longer has
// leaves the whole text out (null) rather than showing an old amount.
const amountOf = (cost: string, part: string): number | null => {
  const price = parsePrice(cost)
  if (price.kind === 'fixed') return part === '' ? price.amount : null
  if (price.kind === 'range') return part === 'max' ? price.max : part === '' ? price.min : null
  if (price.kind === 'formula') return part === 'per' ? price.perUnit : part === '' ? price.base : null
  return null
}

export function fillPrices(template: string, list: Treatment[]): string | null {
  let missing = false
  const text = template.replace(/\{([a-z0-9-]+)(?:\|([^}:]+))?(?::(max|per))?\}/g, (_, slug: string, detail: string | undefined, part = '') => {
    const treatment = list.find((t) => t.slug === slug)
    const options = (treatment?.pricing ?? []).filter((p) => detail === undefined || p.detail === detail)
    const amounts = options.map((p) => amountOf(p.cost, part)).filter((n): n is number => n !== null)
    if (amounts.length === 0) {
      missing = true
      return ''
    }
    return formatRupees(Math.min(...amounts))
  })
  return missing ? null : text
}

// The homepage's rows with their prices filled in from the list. A price it can't fill is left blank; a
// line whose price is gone keeps only its first part ("An examination by Dr. Rahil.")
export function homeServicesFor(list: Treatment[]): HomeService[] {
  const shortLine = (line: string) => `${line.split(';')[0].replace(/\{[^}]*\}/g, '').trim().replace(/[.,]$/, '')}.`
  return homeServices.map((s) => ({ ...s, price: fillPrices(s.price, list) ?? '', line: fillPrices(s.line, list) ?? shortLine(s.line) }))
}

// The tooth chart's areas, each price filled in; an item whose price the list no longer has is left out
export function toothAreasFor(list: Treatment[]): Record<keyof typeof toothAreas, ToothArea> {
  return Object.fromEntries(Object.entries(toothAreas).map(([key, area]) => [key, {
    ...area,
    items: area.items.flatMap(([label, price]) => {
      const filled = fillPrices(price, list)
      return filled === null ? [] : [[label, filled] as [string, string]]
    }),
  }])) as Record<keyof typeof toothAreas, ToothArea>
}

// The treatments page's headings: the homepage's rows, and "Other treatments" for any the sheet added
// that no row names yet
export function treatmentGroups(list: Treatment[]): (HomeService & { items: Treatment[] })[] {
  const services = homeServicesFor(list)
  const groups = services.map((s) => ({ ...s, items: list.filter((t) => s.slugs.includes(t.slug)) })).filter((g) => g.items.length > 0)
  const others = list.filter((t) => !services.some((s) => s.slugs.includes(t.slug)))
  return others.length > 0
    ? [...groups, { id: 'other', name: 'Other treatments', line: 'Ask the clinic about these, or book a check-up.', price: '', slugs: others.map((t) => t.slug), items: others }]
    : groups
}
