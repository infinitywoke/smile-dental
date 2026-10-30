import { patientAge } from '@/lib/patient-fields'

// Each patient's own ledger in Tally. Dr. Rahil's books credit every receipt to the patient's ledger under
// Direct Incomes, named name + age + place ("Asha 40 Katapadi", "Asha40Katapadi", "Asha 40 Udupi/Family":
// the spacing varies). Old patients are matched from his List of Accounts; a patient with no ledger gets one
// named the same way, created in the file that first needs it (docs/TALLY.md).

// Tally exports are UTF-16 (with a byte-order mark); a file saved another way is read as UTF-8
export function decodeTallyFile(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  if (bytes.length > 1 && bytes[0] !== 0 && bytes[1] === 0) return new TextDecoder('utf-16le').decode(bytes)
  return new TextDecoder('utf-8').decode(bytes)
}

const unescape = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

// The ledgers in a List of Accounts export, with the group each sits under
export function readLedgers(text: string): { name: string; group: string }[] {
  const ledgers: { name: string; group: string }[] = []
  for (const m of text.matchAll(/<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/g)) {
    const parent = /<PARENT>([^<]*)<\/PARENT>/.exec(m[2])?.[1] ?? ''
    ledgers.push({ name: unescape(m[1]).trim(), group: unescape(parent).trim() })
  }
  return ledgers
}

// The names of the ledgers that sit under the patients' group (the clinic's own: the group is its Tally's, so
// it is given), however the group's case is written
export function patientLedgers(all: { name: string; group: string }[], patientGroup: string): string[] {
  return all.filter((l) => l.group.toLowerCase() === patientGroup.toLowerCase()).map((l) => l.name)
}

// Letters only, lower case: what is left of a name whatever the spacing, case or punctuation
const letters = (s: string) => s.normalize('NFKD').toLowerCase().replace(/[^a-z]/g, '')

// "Asha Rao 40 Katapadi/Family" → asharao, 40, katapadi (what follows a "/" is his note, not the place)
export function ledgerParts(ledger: string): { name: string; age: number | null; place: string } {
  const m = /^(.*?)(\d{1,3})(.*)$/.exec(ledger)
  if (!m) return { name: letters(ledger), age: null, place: '' }
  return { name: letters(m[1]), age: Number(m[2]), place: letters(m[3].split('/')[0]) }
}

export type LedgerPatient = { id: string; name: string; birth_year: number | null; birth_date: string | null; address: string | null }
export type LedgerMatch = {
  patientId: string
  // His ledgers that could be this patient, likeliest first
  options: string[]
  // Only one ledger fits on name, age and place: chosen without asking
  sure: boolean
}

// The ledger's age was the patient's age when it was made, so it can be a few years less than now
const ageFits = (now: number | null, then: number | null) => now === null || then === null || (now - then >= -1 && now - then <= 3)

export function matchLedgers(patients: LedgerPatient[], ledgers: string[], today?: string): LedgerMatch[] {
  const parts = ledgers.map((ledger) => ({ ledger, ...ledgerParts(ledger) }))
  const matches = patients.map((patient) => {
    const name = letters(patient.name)
    const first = letters(patient.name.trim().split(/\s+/)[0] ?? '')
    const address = letters(patient.address ?? '')
    const age = patientAge(patient, today)
    const scored = parts
      .filter((p) => p.name && (p.name === name || p.name === first) && ageFits(age, p.age))
      .map((p) => {
        const placeFits = !!p.place && !!address && (address.includes(p.place) || p.place.includes(address))
        const score = (p.name === name ? 2 : 1) + (age !== null && p.age !== null ? 1 : 0) + (placeFits ? 1 : 0)
        return { ...p, placeFits, score }
      })
      .sort((a, b) => b.score - a.score || a.ledger.localeCompare(b.ledger))
    const [best, next] = scored
    const sure = !!best && (!next || next.score < best.score) && best.name === name && age !== null && best.age !== null &&
      (best.placeFits || !address || !best.place)
    return { patientId: patient.id, options: scored.map((s) => s.ledger), sure }
  })
  // One ledger is one person: a ledger that is sure for two patients is a question for both
  const sureFor = new Map<string, number>()
  for (const m of matches) if (m.sure) sureFor.set(m.options[0], (sureFor.get(m.options[0]) ?? 0) + 1)
  return matches.map((m) => (m.sure && sureFor.get(m.options[0])! > 1 ? { ...m, sure: false } : m))
}

// A new patient's ledger, named as he names them: "Asha Rao 40 Katapadi" (the place is the address up to
// its first comma). Plain letters, as Tally versions differ on other characters; a name already taken by
// another patient's ledger gets " 2", " 3"…
export function newLedgerName(patient: LedgerPatient, taken: Set<string>, today?: string): string {
  const plain = (s: string) => s.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim()
  const age = patientAge(patient, today)
  const place = plain((patient.address ?? '').split(/[,\n]/)[0]).slice(0, 30)
  const base = [plain(patient.name) || 'Patient', age === null ? '' : String(age), place].filter(Boolean).join(' ').slice(0, 90)
  let name = base
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`
  return name
}
