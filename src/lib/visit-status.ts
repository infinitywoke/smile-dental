import type { VisitStatus } from '@/lib/data/types'

// Two plain facts about a visit, worked out once so every screen agrees:
// the money and whether the WhatsApp was sent (and is still up to date).
// - `due` is this visit's part of what the patient owes (patientAccount's dueByVisit in
//   src/lib/billing.ts), so an advance from another visit is counted;
// - money: "₹X due", "Paid", "Paid ahead" (money paid, nothing charged) or "No bill";
// - `closedAt` is set when the WhatsApp was sent; `resendNeeded` when the bill changed after that.
export function visitStatus(args: {
  closedAt: string | null | undefined
  resendNeeded?: boolean | null
  total: number
  paid: number
  due: number
}): VisitStatus {
  const due = Math.max(Math.round(args.due * 100) / 100, 0)
  const money = due > 0 ? 'due' : args.total > 0 ? 'paid' : args.paid > 0 ? 'ahead' : 'none'
  const sent = !!args.closedAt
  return { money, due, sent, resend: sent && !!args.resendNeeded }
}

// A visit with nothing in it (started, then left) is not listed anywhere
export function isEmptyVisit(args: { notes: string | null | undefined; photos: number; charges: number; payments: number }): boolean {
  return !(args.notes ?? '').trim() && args.photos === 0 && args.charges === 0 && args.payments === 0
}

// The kinds of photo the doctor marks with one tap; stored as the photo's caption
// The private storage bucket for visit photos (used by the server and by the phone's uploads)
export const PHOTO_BUCKET = 'visit-photos'

export const PHOTO_KINDS = ['Prescription', 'X-ray', 'Other'] as const
export type PhotoKind = (typeof PHOTO_KINDS)[number]

// What a photo is called on screen and in WhatsApp: "Prescription", "X-ray", or just "Photo"
export const photoLabel = (kind: PhotoKind | null) => (kind === 'Prescription' || kind === 'X-ray' ? kind : 'Photo')

// Reads a caption back as a kind (older photos have typed captions)
export function photoKind(caption: string | null | undefined): PhotoKind | null {
  const text = (caption ?? '').trim()
  if (/prescription|\brx\b/i.test(text)) return 'Prescription'
  if (/x-?ray|opg|iopa|\bct\b|scan/i.test(text)) return 'X-ray'
  if (/^other$/i.test(text)) return 'Other'
  return null
}
