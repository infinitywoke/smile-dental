import { Check, MessageCircle } from 'lucide-react'
import type { VisitStatus } from '@/lib/data/types'
import { formatRupees } from '@/lib/pricing'

// The two plain facts about a visit: the money, and whether the WhatsApp was sent
export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  const chip = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset'
  return (
    <>
      {status.money === 'due' ? (
        <span className={`${chip} bg-red-50 text-red-700 ring-red-200`}>{formatRupees(status.due)} due</span>
      ) : status.money === 'paid' ? (
        <span className={`${chip} bg-emerald-50 text-emerald-700 ring-emerald-200`}>
          <Check className="h-3 w-3" /> Paid
        </span>
      ) : (
        <span className={`${chip} bg-gray-100 text-gray-600 ring-gray-200`}>No bill</span>
      )}
      {status.sent && (
        <span className={`${chip} bg-green-50 text-green-700 ring-green-200`}>
          <MessageCircle className="h-3 w-3" /> WhatsApp sent
        </span>
      )}
    </>
  )
}
