import { Check, Clock, Receipt } from 'lucide-react'
import type { VisitStatus } from '@/lib/data/types'

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-200">
        <Check className="h-3 w-3 text-gray-600" /> Done
      </span>
    )
  }
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
        <Check className="h-3 w-3 text-emerald-600" /> Paid
      </span>
    )
  }
  if (status === 'billed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
        <Receipt className="h-3 w-3 text-blue-600" /> Billed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
      <Clock className="h-3 w-3 text-amber-600" /> In progress
    </span>
  )
}
