import type { VisitSummary } from './visit-summary'

// Deterministic safety checks that run on every tidied note, so they never depend on the model
// remembering to warn. They return plain sentences for the Confirm card.

// FDI quadrants: 1 upper right, 2 upper left, 3 lower left, 4 lower right (5-8 are the same for baby teeth)
const QUADRANT: Record<string, { jaw: 'upper' | 'lower'; side: 'right' | 'left' }> = {
  '1': { jaw: 'upper', side: 'right' },
  '2': { jaw: 'upper', side: 'left' },
  '3': { jaw: 'lower', side: 'left' },
  '4': { jaw: 'lower', side: 'right' },
  '5': { jaw: 'upper', side: 'right' },
  '6': { jaw: 'upper', side: 'left' },
  '7': { jaw: 'lower', side: 'left' },
  '8': { jaw: 'lower', side: 'right' },
}

const SIDE_WORDS = /\b(upper|lower)\s+(right|left)\b|\b(right|left)\s+(upper|lower)\b/i

// "24" with "lower right" in the complaint or findings → asks whether 46 was meant
export function toothSideWarnings(summary: Pick<VisitSummary, 'complaint' | 'findings' | 'teeth' | 'diagnoses' | 'procedures_done'>): string[] {
  const said = SIDE_WORDS.exec(`${summary.complaint}. ${summary.findings}`)
  if (!said) return []
  const jaw = (said[1] ?? said[4]).toLowerCase()
  const side = (said[2] ?? said[3]).toLowerCase()

  const teeth = new Set<string>()
  for (const t of summary.teeth) teeth.add(t.tooth)
  for (const d of summary.diagnoses) if (d.tooth) teeth.add(d.tooth)
  for (const p of summary.procedures_done) if (p.tooth) teeth.add(p.tooth)
  if (teeth.size === 0) return []

  // Only warn when none of the teeth is on the side that was said
  const anyMatches = [...teeth].some((tooth) => {
    const quadrant = QUADRANT[tooth[0]]
    return quadrant && quadrant.jaw === jaw && quadrant.side === side
  })
  if (anyMatches) return []
  return [`The note says "${jaw} ${side}" but the tooth numbers are ${[...teeth].sort().join(', ')}. Check the tooth number.`]
}

// Drug names that belong to a group people are allergic to
const DRUG_GROUPS: { label: string; allergy: RegExp; drugs: RegExp }[] = [
  {
    label: 'penicillin',
    allergy: /penicillin|amoxicillin|amoxyclav|augmentin|ampicillin/i,
    drugs: /penicillin|amoxicillin|amoxyclav|augmentin|ampicillin|cloxacillin|mox\b/i,
  },
  {
    label: 'NSAID / aspirin',
    allergy: /nsaid|aspirin|ibuprofen|diclofenac|aceclofenac|ketorolac|pain\s?killer/i,
    drugs: /aspirin|ibuprofen|diclofenac|aceclofenac|ketorolac|naproxen|nimesulide|combiflam|zerodol|voveran/i,
  },
  {
    label: 'sulfa',
    allergy: /sulfa|sulpha|sulfonamide|cotrimoxazole|septran/i,
    drugs: /sulfa|sulpha|cotrimoxazole|septran|bactrim/i,
  },
  {
    label: 'metronidazole',
    allergy: /metronidazole|metrogyl|flagyl/i,
    drugs: /metronidazole|metrogyl|flagyl|ornidazole|tinidazole/i,
  },
  {
    label: 'local anaesthetic',
    allergy: /lignocaine|lidocaine|articaine|local anaesthe|local anesthe/i,
    drugs: /lignocaine|lidocaine|articaine|local anaesthe|local anesthe/i,
  },
]

// Allergy on the patient's record (or in this note) against the medicines prescribed
export function allergyWarnings(
  medicalAlerts: string | null | undefined,
  summary: Pick<VisitSummary, 'medicines' | 'patient_updates'>,
): string[] {
  const alerts = [medicalAlerts ?? '', ...(summary.patient_updates?.medical_alerts_add ?? [])].join('; ')
  if (!alerts.trim()) return []
  const out: string[] = []
  for (const group of DRUG_GROUPS) {
    if (!group.allergy.test(alerts)) continue
    for (const medicine of summary.medicines) {
      if (group.drugs.test(medicine.name)) {
        out.push(`${medicine.name} is prescribed, but the patient's record mentions ${group.label} (allergy or caution). Check before confirming.`)
      }
    }
  }
  return out
}

// Model warnings first, then the checks above; the same sentence is never shown twice
export function allWarnings(
  medicalAlerts: string | null | undefined,
  summary: VisitSummary,
): string[] {
  return [...new Set([...summary.warnings, ...toothSideWarnings(summary), ...allergyWarnings(medicalAlerts, summary)])]
}
