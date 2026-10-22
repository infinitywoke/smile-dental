import { chargeName, priceListOptions, type PriceListOption } from '@/lib/pricing'

// The visit's usual charges: the price-list items he bills most, one tap each (fixed prices only, so
// there is no amount to type), topped up with the common ones while his own history is short.

export type UsualCharge = { slug: string; description: string; amount: number; label: string }

export const USUAL_COUNT = 6

// While there is little history: these price-list items, else the first fixed-price option of each
// treatment (should the list change)
const STARTERS = [
  'Consultation – Standard Consultation',
  'X-Ray – Standard X-Ray',
  'Scaling / Teeth Cleaning / Prophylaxis – Mild case',
  'Tooth Extraction – Regular Extraction',
  'Fillings – 3M Ketac Molar GIC',
  'Root Canal Treatment – Standard Treatment',
]
const STARTER_TREATMENTS = ['Consultation', 'X-Ray', 'Scaling', 'Tooth Extraction', 'Fillings', 'Root Canal']

// The treatment as he would say it, without its alternatives or notes: "Scaling / Teeth Cleaning / ..."
// is "Scaling", "Root Canal Treatment" is "Root canal"
const shortTreatment = (treatment: string) => {
  const name = treatment.split(' / ')[0].split(' (')[0].replace(/ Treatment$/, '').trim()
  return name.charAt(0) + name.slice(1).toLowerCase()
}

// A short name for the button: "Consultation", "Scaling · Mild case", "3M Z350 Composite"
export function usualLabel(o: Pick<PriceListOption, 'treatment' | 'detail'>): string {
  const treatment = shortTreatment(o.treatment)
  const detail = o.detail.trim()
  if (!detail || /^standard\b/i.test(detail)) return treatment
  if (detail.split(/\s+/).length <= 2 && !detail.toLowerCase().includes(treatment.split(' ').pop()!.toLowerCase())) return `${treatment} · ${detail}`
  return detail
}

export function usualCharges(counts: { description: string; count: number }[], options: PriceListOption[] = priceListOptions(), size = USUAL_COUNT): UsualCharge[] {
  const fixed = options.filter((o): o is PriceListOption & { price: { kind: 'fixed'; amount: number } } => o.price.kind === 'fixed')
  const byName = new Map(fixed.map((o) => [chargeName(o), o]))
  const picked: typeof fixed = []
  const add = (o: (typeof fixed)[number] | undefined) => {
    if (o && !picked.includes(o) && picked.length < size) picked.push(o)
  }
  // One count per item; a charge added from a recording carries its teeth ("... – Standard Treatment (46)")
  const optionOf = (description: string) => byName.get(description) ?? byName.get(description.replace(/ \([^()]*\)$/, ''))
  const billed = new Map<(typeof fixed)[number], number>()
  for (const { description, count } of counts) {
    const o = optionOf(description)
    if (o) billed.set(o, (billed.get(o) ?? 0) + count)
  }
  for (const [o] of [...billed].sort(([a, x], [b, y]) => y - x || chargeName(a).localeCompare(chargeName(b)))) add(o)
  for (const starter of STARTERS) add(byName.get(starter))
  for (const starter of STARTER_TREATMENTS) add(fixed.find((o) => o.treatment.toLowerCase().startsWith(starter.toLowerCase())))
  return picked.map((o) => ({ slug: o.slug, description: chargeName(o), amount: o.price.amount, label: usualLabel(o) }))
}
