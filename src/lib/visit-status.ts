import type { VisitStatus } from '@/lib/data/types'

// Two plain facts about a visit, worked out once so every screen agrees:
// the money (no bill, paid, or how much is still due) and whether the WhatsApp was sent.
// `closedAt` is set when the WhatsApp message was sent.
export function visitStatus(args: { closedAt: string | null | undefined; total: number; paid: number }): VisitStatus {
  const due = Math.round((args.total - args.paid) * 100) / 100
  const money = args.total <= 0 ? 'none' : due > 0 ? 'due' : 'paid'
  return { money, due: Math.max(due, 0), sent: !!args.closedAt }
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

// Reads a caption back as a kind (older photos have typed captions)
export function photoKind(caption: string | null | undefined): PhotoKind | null {
  const text = (caption ?? '').trim()
  if (/prescription|\brx\b/i.test(text)) return 'Prescription'
  if (/x-?ray|opg|iopa|\bct\b|scan/i.test(text)) return 'X-ray'
  if (/^other$/i.test(text)) return 'Other'
  return null
}
