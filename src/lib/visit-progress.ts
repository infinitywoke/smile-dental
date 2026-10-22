import { formatRupees } from '@/lib/pricing'

// The visit page's progress strip (the Cockpit look): Notes · Bill · Paid · Next · Sent. Each step is
// filled from 0 (not yet) to 1 (done); Paid fills as the bill is paid. `state` says it in words.

export type VisitStepKey = 'notes' | 'bill' | 'paid' | 'next' | 'sent'
export type VisitStep = { key: VisitStepKey; label: string; filled: number; state: string }

export type VisitState = {
  notes: string
  charges: number
  // This visit's charges and payments, and what the patient owes in all (as the payment card says it)
  total: number
  paid: number
  due: number
  next: boolean
  sent: boolean
  resend: boolean
}

export function visitProgress(v: VisitState): VisitStep[] {
  const billed = v.total > 0 || v.paid > 0
  const paid = !billed ? 0 : v.due <= 0 ? 1 : v.total > 0 ? Math.min(v.paid / v.total, 1) : 0
  return [
    { key: 'notes', label: 'Notes', filled: v.notes.trim() ? 1 : 0, state: v.notes.trim() ? 'written' : 'not written yet' },
    { key: 'bill', label: 'Bill', filled: v.charges > 0 ? 1 : 0, state: v.charges > 0 ? formatRupees(v.total) : 'no charges yet' },
    {
      key: 'paid', label: 'Paid', filled: paid,
      state: !billed ? 'nothing to pay yet' : paid === 1 ? 'paid in full' : `${formatRupees(v.due)} due`,
    },
    { key: 'next', label: 'Next', filled: v.next ? 1 : 0, state: v.next ? 'booked' : 'none booked' },
    {
      key: 'sent', label: 'Sent', filled: v.sent ? (v.resend ? 0.5 : 1) : 0,
      state: v.sent ? (v.resend ? 'bill changed, send again' : 'sent on WhatsApp') : 'not sent yet',
    },
  ]
}

// After this long, the visit was started earlier and reopened: no ticking clock
const CHAIR_HOURS = 3

// How long the patient has been in the chair: "18:42", "1:05:09"; null once it is past CHAIR_HOURS
export function chairTime(startedAt: string, now: Date): string | null {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000))
  if (seconds >= CHAIR_HOURS * 3600) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}
