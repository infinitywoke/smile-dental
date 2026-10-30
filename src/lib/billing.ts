import { reviewLinkOf, type ClinicContext } from '@/lib/clinic'
import { formatRupees } from '@/lib/pricing'
import { formatDate, todayInIndia } from '@/lib/dates'
import { appointmentLines, hindiDate, kannadaDate, messageHeader, messageSignOff, questionsLine, shortLocation, type MessageLanguage } from '@/lib/whatsapp'

// Money is added in paise so 0.1 + 0.2 never shows as 0.30000000000000004
export function sumAmounts(items: { amount: number }[]): number {
  return items.reduce((paise, item) => paise + Math.round(item.amount * 100), 0) / 100
}

export const MAX_AMOUNT = 1_000_000

// A bill line's amount: a discount is below zero and reads "−₹500"
export const signedRupees = (n: number) => (n < 0 ? `−${formatRupees(-n)}` : formatRupees(n))

// Photos in one WhatsApp message's link, which holds 10 things at most (supabase/share-links-2026-10.sql):
// the typed prescription, the bill and these
export const MAX_PHOTOS_TO_SEND = 8

// A rupee amount typed by hand: "1,250", "₹ 1250.50". Returns null when it isn't a sensible amount.
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]|rs\.?/gi, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value <= MAX_AMOUNT ? value : null
}

// One visit's money, as the `visit_money` view gives it
export type VisitMoney = { id: string; date: string; createdAt: string; charged: number; paid: number }

export type PatientAccount = {
  // All the patient's charges minus all their payments: positive is owed, negative is an advance
  owed: number
  // What is still owed on each visit; whenever something is owed, the parts add up to `owed`
  dueByVisit: Map<string, number>
}

// The one money rule every screen uses: Today, the patient page, the visit page and the WhatsApp message.
// A payment pays its own visit first; anything extra pays the oldest visit still unpaid; what is left
// over is an advance. Worked in paise, so the parts always add up.
export function patientAccount(visits: VisitMoney[]): PatientAccount {
  const paise = (n: number) => Math.round(n * 100)
  const oldestFirst = [...visits].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  let extra = 0
  let charged = 0
  let paid = 0
  const due = new Map<string, number>()
  for (const v of oldestFirst) {
    const c = paise(v.charged)
    const p = paise(v.paid)
    charged += c
    paid += p
    due.set(v.id, Math.max(c - p, 0))
    extra += Math.max(p - c, 0)
  }
  for (const v of oldestFirst) {
    const use = Math.min(due.get(v.id)!, extra)
    due.set(v.id, due.get(v.id)! - use)
    extra -= use
  }
  return { owed: (charged - paid) / 100, dueByVisit: new Map([...due].map(([id, d]) => [id, d / 100])) }
}

// The patient's newest visit that still has a part owed: where "Collect" goes
export function newestVisitOwing(visits: VisitMoney[], account: PatientAccount): string | null {
  const newestFirst = [...visits].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  return newestFirst.find((v) => (account.dueByVisit.get(v.id) ?? 0) > 0)?.id ?? null
}

// Rows of the `visit_money` view, as the money rule reads them
export function visitMoneyOf(rows: { visit_id: string; visit_date: string; created_at: string; charged: number | string; paid: number | string }[]): VisitMoney[] {
  return rows.map((r) => ({ id: r.visit_id, date: r.visit_date, createdAt: r.created_at, charged: Number(r.charged), paid: Number(r.paid) }))
}

// Why a visit that holds money can't be deleted, naming the amounts
export function paymentsHeldMessage(payments: { amount: number; method: 'upi' | 'cash' }[]): string {
  const cash = sumAmounts(payments.filter((p) => p.method === 'cash'))
  const upi = sumAmounts(payments.filter((p) => p.method === 'upi'))
  const parts = [cash > 0 && `cash ${formatRupees(cash)}`, upi > 0 && `UPI ${formatRupees(upi)}`].filter(Boolean).join(', ')
  return `This visit holds ${formatRupees(sumAmounts(payments))} in payments (${parts}). If they were a mistake, remove them in Payment first, then delete the visit.`
}

export type BillSummary = {
  // This visit's charges and payments
  total: number
  paid: number
  // This visit's balance: billed minus paid (negative = paid more than billed)
  balance: number
  // The patient's other visits together: owed (positive) or an advance (negative)
  earlier: number
  // What the patient owes, all visits together (patientAccount's `owed`); negative is an advance
  due: number
}

// This visit's bill, with what the patient owes across all visits (patientAccount's `owed`)
export function summarise(args: {
  charges: { amount: number }[]
  payments: { amount: number }[]
  owed: number
}): BillSummary {
  const total = sumAmounts(args.charges)
  const paid = sumAmounts(args.payments)
  const balance = Math.round((total - paid) * 100) / 100
  const due = Math.round(args.owed * 100) / 100
  return { total, paid, balance, earlier: Math.round((due - balance) * 100) / 100, due }
}

// What the ticked photos are, for the message and their page: "prescription", "X-rays", "photos"; in
// Kannada "ನಿಮ್ಮ ಫೋಟೋ" (your photo) or "ನಿಮ್ಮ ಫೋಟೋಗಳು"
export function photosWord(labels: string[], language: MessageLanguage = 'en'): string {
  const one = labels.length === 1
  if (language === 'kn') return one ? 'ನಿಮ್ಮ ಫೋಟೋ' : 'ನಿಮ್ಮ ಫೋಟೋಗಳು'
  if (language === 'hi') return 'फ़ोटो'
  const all = (label: string) => labels.every((l) => l === label)
  return all('Prescription') ? (one ? 'prescription' : 'prescriptions') : all('X-ray') ? (one ? 'X-ray' : 'X-rays') : one ? 'photo' : 'photos'
}

// What a visit's link holds, for the message and its page: "prescription, X-rays and bill". A
// prescription (typed, or a photo of one) is named once; the other photos as photosWord says them.
// In Kannada with the words patients use: ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್, ಫೋಟೋ(ಗಳು), ಬಿಲ್.
export function linkWord(labels: string[], language: MessageLanguage = 'en'): string {
  const kn = language === 'kn'
  const photos = labels.filter((l) => l !== 'Prescription' && l !== 'Bill')
  const parts = [
    labels.includes('Prescription') && (language === 'hi' ? 'प्रिस्क्रिप्शन' : kn ? 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್' : 'prescription'),
    photos.length > 0 && (language === 'hi' ? 'फ़ोटो' : kn ? (photos.length === 1 ? 'ಫೋಟೋ' : 'ಫೋಟೋಗಳು') : photosWord(photos)),
    labels.includes('Bill') && (language === 'hi' ? 'बिल' : kn ? 'ಬಿಲ್' : 'bill'),
  ].filter((p): p is string => !!p)
  const and = language === 'hi' ? ' और ' : kn ? ' ಮತ್ತು ' : ' and '
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')}${and}${parts[parts.length - 1]}`
}

// The one WhatsApp message after a visit, friendly and short, for a phone: "Hi Asha," and thanks, one
// short link to the prescription, photos and bill (a page that shows them for 30 days: no money in the
// message itself), the next appointment, and the review once (when the clinic has a link to ask for it).
// First name only; nothing else about the patient. Written for the clinic it is given (src/lib/clinic.ts).
export function visitMessage(ctx: ClinicContext, args: {
  patientName: string
  visitDate: string
  nextAppointment?: { starts_at: string } | null
  // One short link to the visit's page, and what it holds ("Prescription", "X-ray", a typed name, "Bill")
  photoLink?: { url: string; labels: string[] } | null
  // A Google review asked in the same message (once per patient), in the review message's own words
  review?: boolean
  language?: MessageLanguage
  today?: string
}): string {
  const { language = 'en', today = todayInIndia() } = args
  const kn = language === 'kn'
  const onTheDay = args.visitDate === today
  const out = [
    ...messageHeader(args.patientName, language),
    language === 'hi' ? `${onTheDay ? 'आज' : `${hindiDate(args.visitDate, true)} को`} आने के लिए धन्यवाद। आपसे मिलकर अच्छा लगा।` : kn
      ? `${onTheDay ? 'ಇಂದು' : `${kannadaDate(args.visitDate, true)} ರಂದು`} ನಮ್ಮಲ್ಲಿಗೆ ಬಂದಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು.`
      : `Thank you for coming in ${onTheDay ? 'today' : `on ${formatDate(args.visitDate)}`}. It was good to see you.`,
  ]

  // "Your prescription, X-ray and bill are here (the link works for 30 days):", then the link
  const link = args.photoLink
  if (link && link.labels.length > 0) {
    const word = linkWord(link.labels, language)
    const many = word.includes(' and ') || /s$/.test(word)
    out.push('', language === 'hi' ? `${word} इस लिंक पर देखें _(लिंक 30 दिन तक चलेगा)_:` : kn
      ? `ನಿಮ್ಮ ${word} ಈ ಲಿಂಕ್‌ನಲ್ಲಿ ನೋಡಿ _(ಲಿಂಕ್ 30 ದಿನ ಕೆಲಸ ಮಾಡುತ್ತದೆ)_:`
      : `Your ${word} ${many ? 'are' : 'is'} here _(the link works for 30 days)_:`, link.url)
  }

  if (args.nextAppointment?.starts_at) {
    out.push('', language === 'hi' ? '*आपकी अगली अपॉइंटमेंट*' : kn ? '*ಮುಂದಿನ ಅಪಾಯಿಂಟ್ಮೆಂಟ್*' : '*Your next appointment*', ...appointmentLines(args.nextAppointment.starts_at, language), shortLocation(ctx, language))
  }

  const reviewLink = reviewLinkOf(ctx.clinic)
  if (args.review && reviewLink) {
    out.push('', language === 'hi' ? 'अगर आपके पास एक मिनट हो, तो Google पर एक छोटा सा रिव्यू लिख दें। इससे आस-पास के लोगों को क्लिनिक ढूँढने में मदद मिलती है:' : kn
      ? 'ಒಂದು ನಿಮಿಷ ಸಮಯವಿದ್ದರೆ, Google ನಲ್ಲಿ ಒಂದು ಚಿಕ್ಕ ವಿಮರ್ಶೆ (review) ಬರೆಯಿರಿ. ಇದರಿಂದ ಈ ಭಾಗದ ಇತರರಿಗೆ ಕ್ಲಿನಿಕ್ ಹುಡುಕಲು ಸಹಾಯವಾಗುತ್ತದೆ:'
      : 'If you have a minute, a short Google review helps other people in the area find the clinic:', reviewLink)
  }

  out.push('', questionsLine(ctx, language), ...messageSignOff(ctx, language))
  return out.join('\n')
}

