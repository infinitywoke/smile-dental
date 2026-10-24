// The typed prescription lives in the visit notes, as the smart notes write it:
//   Prescription:
//   - Amoxicillin 500 mg - three times a day - 5 days
// so there is one place to type and edit it. These read and change that part of the notes.

const HEADER = /^\s*(?:prescription|rx|medicines?)\s*:\s*(.*)$/i
// Another part of the notes starts ("Advice: ...", "Plan: ...")
const SECTION = /^\s*[A-Za-z][A-Za-z /]{1,30}:/
const ITEM = /^\s*(?:[-•*]|\d{1,2}[.)])\s*/

type Section = { header: number; items: { line: number; text: string }[]; inline: string }

function findSection(lines: string[]): Section | null {
  const header = lines.findIndex((l) => HEADER.test(l))
  if (header < 0) return null
  const inline = lines[header].match(HEADER)![1].trim()
  const items: Section['items'] = []
  for (let i = header + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) break
    if (ITEM.test(line)) {
      const text = line.replace(ITEM, '').trim()
      if (text) items.push({ line: i, text })
    } else if (SECTION.test(line)) break
    else break
  }
  return { header, items, inline }
}

// The medicines, one per line
export function prescriptionLines(notes: string): string[] {
  const section = findSection(notes.split('\n'))
  if (!section) return []
  return [...(section.inline ? [section.inline] : []), ...section.items.map((i) => i.text)]
}

// "Advice: ..." from the notes, for the bottom of the prescription: on its own line, or as points under it
// ("Advice:" then "- Soft food for a day"), joined into sentences
export function adviceText(notes: string): string {
  const lines = notes.split('\n')
  const at = lines.findIndex((l) => /^\s*advice\s*:/i.test(l))
  if (at < 0) return ''
  const said = [lines[at].replace(/^\s*advice\s*:\s*/i, '').trim()]
  for (const line of lines.slice(at + 1)) {
    if (!ITEM.test(line)) break
    said.push(line.replace(ITEM, '').trim())
  }
  return said.filter(Boolean).map((s) => s.replace(/[.\s]+$/, '')).join('. ')
}

// The medicines he has prescribed, most used first, then the starter list ("Amoxicillin 500 mg"): the
// names only, for the smart notes to spell them the way he writes them
export function medicineNames(pastNotes: string[], limit = 60): string[] {
  const counts = new Map<string, { name: string; n: number }>()
  for (const note of pastNotes) {
    for (const line of prescriptionLines(note)) {
      const name = line.split(/\s+-\s+/)[0].trim()
      if (!name) continue
      const seen = counts.get(name.toLowerCase()) ?? { name, n: 0 }
      seen.n += 1
      counts.set(name.toLowerCase(), seen)
    }
  }
  const names = [...[...counts.values()].sort((a, b) => b.n - a.n).map((c) => c.name), ...STARTER_MEDICINES.map((m) => m.split(/\s+-\s+/)[0])]
  return names.filter((name, i) => names.findIndex((x) => x.toLowerCase() === name.toLowerCase()) === i).slice(0, limit)
}

const same = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ')

// Adds a medicine at the end of the prescription (making the section if there is none yet)
export function addPrescriptionLine(notes: string, medicine: string): string {
  const text = medicine.trim()
  if (!text || prescriptionLines(notes).some((l) => same(l, text))) return notes
  const lines = notes.split('\n')
  const section = findSection(lines)
  if (!section) {
    const body = notes.replace(/\s+$/, '')
    return `${body ? `${body}\n` : ''}Prescription:\n- ${text}`
  }
  const after = section.items.length > 0 ? section.items[section.items.length - 1].line : section.header
  lines.splice(after + 1, 0, `- ${text}`)
  return lines.join('\n')
}

// Takes one medicine out (by its place in prescriptionLines); the heading goes with the last one
export function removePrescriptionLine(notes: string, index: number): string {
  const lines = notes.split('\n')
  const section = findSection(lines)
  if (!section) return notes
  const all = [...(section.inline ? [{ line: section.header, text: section.inline }] : []), ...section.items]
  const target = all[index]
  if (!target) return notes
  if (all.length === 1) {
    const drop = new Set([section.header, ...section.items.map((i) => i.line)])
    return lines.filter((_, i) => !drop.has(i)).join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
  }
  if (target.line === section.header) lines[section.header] = 'Prescription:'
  else lines.splice(target.line, 1)
  return lines.join('\n')
}

// Until his own prescriptions fill the quick buttons: common dental medicines, adult doses. He reads
// each line before sending, and edits it in the notes when his dose differs.
export const STARTER_MEDICINES = [
  'Amoxicillin 500 mg - 1 capsule three times a day - 5 days',
  'Amoxicillin + Clavulanic acid 625 mg - 1 tablet twice a day - 5 days',
  'Metronidazole 400 mg - 1 tablet three times a day - 5 days',
  'Ibuprofen 400 mg - 1 tablet after food, up to three times a day - 3 days',
  'Paracetamol 650 mg - 1 tablet when needed, up to three times a day - 3 days',
  'Pantoprazole 40 mg - 1 tablet before breakfast - 5 days',
  'Chlorhexidine 0.2% mouthwash - rinse with 10 ml twice a day - 7 days',
  'Potassium nitrate toothpaste (for sensitivity) - brush twice a day',
]

// The medicines he prescribes most, from his past notes (newest first), topped up from the starter list
export function quickMedicines(pastNotes: string[], limit = 8): string[] {
  const counts = new Map<string, { text: string; n: number; first: number }>()
  pastNotes.forEach((notes, order) => {
    for (const line of prescriptionLines(notes)) {
      const key = line.trim().toLowerCase().replace(/\s+/g, ' ')
      const have = counts.get(key)
      if (have) have.n++
      else counts.set(key, { text: line.trim(), n: 1, first: order })
    }
  })
  const own = [...counts.values()].sort((a, b) => b.n - a.n || a.first - b.first).map((c) => c.text).slice(0, limit)
  const starters = STARTER_MEDICINES.filter((s) => !own.some((o) => same(o, s)))
  return [...own, ...starters].slice(0, limit)
}
