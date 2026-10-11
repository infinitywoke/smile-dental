// Keeps identifying details out of what is sent to an AI service.
//
// The patient's name, address and phone number are swapped for placeholders before the note
// leaves the server, and swapped back in what comes home. Everything is done on the server
// with plain string matching, so what is sent can be checked.
//
// This is a safety net, not a guarantee: a name the doctor says that is not on the patient's
// record (a relative, a referring doctor) can still get through. The prompt asks the model to
// leave such names out, and the mic hint tells the doctor to avoid saying names.

export const PLACEHOLDERS = {
  patient: '[PATIENT]',
  address: '[ADDRESS]',
  phone: '[PHONE]',
  email: '[EMAIL]',
} as const

export type Identity = {
  name: string | null
  address: string | null
  phone: string | null
}

// Words too common to hide: hiding them would damage the note ("Dr", "Road", "near" ...)
const SKIP_WORDS = new Set([
  'the', 'and', 'near', 'opp', 'opposite', 'behind', 'road', 'street', 'cross', 'main', 'post', 'house',
  'flat', 'floor', 'apartment', 'apartments', 'nagar', 'layout', 'colony', 'building', 'mr', 'mrs', 'ms',
  'shri', 'smt', 'kumari', 'dr', 'master', 'baby',
])

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Distinct words of a free-text field that are worth hiding: letters only, at least 3 long
function words(value: string | null): string[] {
  if (!value) return []
  // Numbers are kept out of this unless they are long enough to be a postcode or a phone number
  const found = value.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && (!/^\d+$/.test(w) || w.length >= 5))
  return [...new Set(found.filter((w) => !SKIP_WORDS.has(w.toLowerCase())))]
}

function wordPattern(list: string[]): RegExp | null {
  if (list.length === 0) return null
  // Longest first, so "Shetty" is not split by a shorter word inside it
  const alternatives = [...list].sort((a, b) => b.length - a.length).map(escapeRegExp)
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'giu')
}

// Indian mobile numbers written in the usual ways: 98450 21763, +91-9845021763, 098450 21763
const PHONE_PATTERN = /(?<!\d)(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?!\d)/g
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

export type Anonymised = {
  // What may be sent
  text: string
  // Puts the real details back into text that came from the AI
  restore: (text: string) => string
}

// Capitalised words that are not names: days, months, titles, medicines and dental terms.
// Anything else that is capitalised in the middle of a sentence is treated as a possible name.
const NOT_NAMES = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'mr', 'mrs', 'ms', 'dr', 'doctor', 'shri', 'smt', 'sir', 'madam', 'rs', 'rupees', 'upi', 'gpay', 'phonepe', 'google',
  'amoxicillin', 'amoxyclav', 'augmentin', 'metronidazole', 'paracetamol', 'ibuprofen', 'aceclofenac', 'diclofenac',
  'pantoprazole', 'omeprazole', 'chlorhexidine', 'lignocaine', 'lidocaine', 'articaine', 'combiflam', 'zerodol',
  'voveran', 'dolo', 'crocin', 'calpol', 'ketorolac', 'naproxen', 'nimesulide', 'azithromycin', 'cefixime',
  'clindamycin', 'ofloxacin', 'ornidazole', 'tinidazole', 'ranitidine', 'betadine', 'penicillin', 'aspirin',
  'ivoclar', 'zirconia', 'composite', 'ceramic', 'metal', 'iopa', 'opg', 'fdi', 'rct',
  'patient', 'tooth', 'teeth', 'right', 'left', 'upper', 'lower', 'next', 'visit', 'note',
])

// The anonymiser for one patient. Name, address, phone and email are replaced; so is any other
// capitalised word in the middle of a sentence that is not a known term (a relative's name, a
// referring doctor), each with its own numbered placeholder so it can be put back on return.
// Several texts can share one anonymiser, so the numbering and the way back stay consistent.
export function createAnonymiser(identity: Identity) {
  const others = new Map<string, string>() // placeholder -> original word
  const placeholderOf = new Map<string, string>() // lower-case word -> placeholder

  const nameWords = words(identity.name)
  const addressWords = words(identity.address)
  const namePattern = wordPattern(nameWords)
  // A word in both name and address is hidden as the name; the rest of the address as the address
  const addressPattern = wordPattern(addressWords.filter((w) => !nameWords.some((n) => n.toLowerCase() === w.toLowerCase())))

  function maskOthers(value: string): string {
    return value.replace(/\b[A-Z][a-z]{2,}\b/g, (word, offset: number, whole: string) => {
      if (NOT_NAMES.has(word.toLowerCase())) return word
      // The first word of a sentence is capitalised anyway, so it says nothing
      const before = whole.slice(0, offset).trimEnd()
      if (before === '' || /[.!?:\n]$/.test(before)) return word
      const key = word.toLowerCase()
      let placeholder = placeholderOf.get(key)
      if (!placeholder) {
        placeholder = `[NAME${others.size + 1}]`
        placeholderOf.set(key, placeholder)
        others.set(placeholder, word)
      }
      return placeholder
    })
  }

  function text(value: string): string {
    // Emails and phone numbers first, so a name inside an email address goes with the whole address
    let out = value.replace(EMAIL_PATTERN, PLACEHOLDERS.email).replace(PHONE_PATTERN, PLACEHOLDERS.phone)
    if (namePattern) out = out.replace(namePattern, PLACEHOLDERS.patient)
    if (addressPattern) out = out.replace(addressPattern, PLACEHOLDERS.address)
    out = maskOthers(out)
    // Tidy "[PATIENT] [PATIENT]" (first and last name) into one placeholder, same for the address
    return out
      .replace(/(\[PATIENT\])(?:\s+\[PATIENT\])+/g, '$1')
      .replace(/(\[ADDRESS\])(?:[\s,]+\[ADDRESS\])+/g, '$1')
  }

  function restore(value: string): string {
    let out = value
      .replaceAll(PLACEHOLDERS.patient, identity.name?.trim() || 'the patient')
      .replaceAll(PLACEHOLDERS.address, identity.address?.trim() || 'the address')
      .replaceAll(PLACEHOLDERS.phone, identity.phone?.trim() || 'the phone number')
      .replaceAll(PLACEHOLDERS.email, 'the email address')
    for (const [placeholder, original] of others) out = out.replaceAll(placeholder, original)
    return out
  }

  return { text, restore }
}

export function anonymise(value: string, identity: Identity): Anonymised {
  const anonymiser = createAnonymiser(identity)
  return { text: anonymiser.text(value), restore: anonymiser.restore }
}

// Applies `restore` to every string inside a value (objects and arrays included)
export function restoreDeep<T>(value: T, restore: (text: string) => string): T {
  if (typeof value === 'string') return restore(value) as T
  if (Array.isArray(value)) return value.map((item) => restoreDeep(item, restore)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restoreDeep(item, restore)])) as T
  }
  return value
}

// A last check on the finished message: anything that still identifies the patient. Stricter than
// the replacement above, so a miss there is caught here and the message is not sent.
// Returns what was found, as short descriptions that never repeat the identifying value itself.
export function findIdentityLeaks(rawText: string, identity: Identity): string[] {
  const leaks: string[] = []
  // The placeholders are not leaks, even when a name happens to contain the same letters
  const text = rawText.replace(/\[(?:PATIENT|ADDRESS|PHONE|EMAIL|NAME\d+)\]/g, ' ')
  const lower = text.toLowerCase()

  for (const [label, source] of [['name', identity.name], ['address', identity.address]] as const) {
    for (const word of words(source)) {
      const w = word.toLowerCase()
      // Short words must stand alone (so "Mala" is not found inside "malaise"); longer ones are found anywhere
      const found = w.length >= 5 ? lower.includes(w) : new RegExp(`(?<![\p{L}\p{N}])${escapeRegExp(w)}(?![\p{L}\p{N}])`, 'iu').test(text)
      if (found) leaks.push(`a word from the patient's ${label}`)
    }
  }

  const phoneDigits = (identity.phone ?? '').replace(/\D/g, '').slice(-10)
  if (phoneDigits.length === 10 && text.replace(/[\s-]/g, '').includes(phoneDigits)) leaks.push("the patient's phone number")
  if (new RegExp(PHONE_PATTERN.source).test(text)) leaks.push('a phone number')
  if (new RegExp(EMAIL_PATTERN.source).test(text)) leaks.push('an email address')

  return [...new Set(leaks)]
}
