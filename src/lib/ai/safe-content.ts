import { createAnonymiser, findIdentityLeaks, type Identity } from './anonymise'
import { visitNoteContent } from './visit-prompt'

// The ONLY way to build what is sent to an AI service.
//
// `generateNote` accepts nothing but a `SafeNoteContent`, and the only function that makes one is
// `prepareNoteForAi` below. It
//   1. takes the patient's name, address and phone only to know WHAT TO REMOVE,
//   2. builds the message from an allow-list: today's date, age, gender, the medical alerts and
//      the note, the last two with identifying words replaced by placeholders (the patient's own
//      details, and any other capitalised word that could be somebody's name),
//   3. checks the finished message again for any trace of the identity, and refuses to send
//      (returns an error, sends nothing) if one is found.
// Nothing else about the patient (name, date of birth, address, phone, email, the visit's id,
// the patient's id) is ever part of the message.

declare const safe: unique symbol

export type SafeNoteContent = { readonly [safe]: true; readonly text: string }

export type PreparedNote =
  | { ok: true; content: SafeNoteContent; restore: (text: string) => string }
  | { ok: false; error: string }

export function prepareNoteForAi(args: {
  today: string
  identity: Identity
  // Whole years, worked out by the caller; the date of birth itself never reaches this file
  ageYears: number | null
  gender: 'female' | 'male' | 'other' | null
  medicalAlerts: string | null
  notes: string
}): PreparedNote {
  const { identity } = args
  // One anonymiser for everything sent, so a placeholder means the same thing wherever it appears
  const anonymiser = createAnonymiser(identity)
  const noteText = anonymiser.text(args.notes)
  const alerts = args.medicalAlerts ? anonymiser.text(args.medicalAlerts) : null
  const who = [args.ageYears !== null ? `${args.ageYears}-year-old` : null, args.gender].filter(Boolean).join(' ') || null

  const text = visitNoteContent({ today: args.today, patient: who, medicalAlerts: alerts, notes: noteText })

  // Belt and braces: even if the replacement above missed something, it is caught here. Only the
  // free text is checked (the fixed labels of the message are not the patient's words).
  const leaks = [noteText, alerts ?? ''].flatMap((part) => findIdentityLeaks(part, identity))
  if (leaks.length > 0) {
    return { ok: false, error: 'The note still contains identifying details, so it was not sent. Remove names, addresses and numbers from it, then try again.' }
  }
  return { ok: true, content: { text } as SafeNoteContent, restore: anonymiser.restore }
}
