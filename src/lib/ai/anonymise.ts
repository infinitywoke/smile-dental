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
  const found = value.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !/^\d+$/.test(w))
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

export function anonymise(text: string, identity: Identity): Anonymised {
  let out = text
  const nameWords = words(identity.name)
  const addressWords = words(identity.address)

  const namePattern = wordPattern(nameWords)
  if (namePattern) out = out.replace(namePattern, PLACEHOLDERS.patient)
  // A word in both name and address is hidden as the name; the rest of the address as the address
  const addressPattern = wordPattern(addressWords.filter((w) => !nameWords.some((n) => n.toLowerCase() === w.toLowerCase())))
  if (addressPattern) out = out.replace(addressPattern, PLACEHOLDERS.address)

  out = out.replace(PHONE_PATTERN, PLACEHOLDERS.phone).replace(EMAIL_PATTERN, PLACEHOLDERS.email)
  // Tidy "[PATIENT] [PATIENT]" (first and last name) into one placeholder, same for the address
  out = out
    .replace(/(\[PATIENT\])(?:\s+\[PATIENT\])+/g, '$1')
    .replace(/(\[ADDRESS\])(?:[\s,]+\[ADDRESS\])+/g, '$1')

  const restore = (value: string) =>
    value
      .replaceAll(PLACEHOLDERS.patient, identity.name?.trim() || 'the patient')
      .replaceAll(PLACEHOLDERS.address, identity.address?.trim() || 'the address')
      .replaceAll(PLACEHOLDERS.phone, identity.phone?.trim() || 'the phone number')
      .replaceAll(PLACEHOLDERS.email, 'the email address')

  return { text: out, restore }
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
