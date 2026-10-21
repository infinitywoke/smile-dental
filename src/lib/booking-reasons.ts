import { bookingReasons, homeServices, treatments } from '@/config/site'

// The reason a booking link asks for: a reason (rootcanal, or its label), a price-list treatment
// (root-canal-treatment), or a treatment's name as older links carried it (Root Canal Treatment).
// Anything else picks nothing, and the patient chooses on the card.
export function reasonFromLink(value: string | string[] | undefined): string | null {
  const text = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase()
  if (!text) return null
  const reason = bookingReasons.find((r) => r.id === text || r.label.toLowerCase() === text)
  if (reason) return reason.id
  const treatment = treatments.find((t) => t.slug === text || t.name.toLowerCase() === text)
  return (treatment && homeServices.find((s) => s.slugs.includes(treatment.slug))?.id) ?? null
}
