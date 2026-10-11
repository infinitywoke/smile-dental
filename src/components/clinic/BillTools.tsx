'use client'

import { useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { VisitBill } from '@/lib/data/billing'
import { removeCharge } from '@/lib/actions/billing'
import { formatRupees } from '@/lib/pricing'
import { useBackToClose } from './FullScreen'
import { PriceListSheet } from './PriceListSheet'

// The bill: its lines and total, and "Add charge", which opens the clinic price list
export function BillSection({
  visitId,
  charges,
  total,
  beforeAction,
}: {
  visitId: string
  charges: VisitBill['charges']
  total: number
  beforeAction: () => Promise<void>
}) {
  const sheet = useBackToClose()

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-gray-900">Bill</h2>
      {charges.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          {charges.map((charge) => (
            <div key={charge.id} className="flex items-center gap-2 border-b border-gray-100 py-1 pl-4 pr-1">
              <p className="min-w-0 flex-1 text-base text-gray-900">{charge.description}</p>
              <p className="shrink-0 text-base font-semibold tabular-nums text-gray-900">{formatRupees(charge.amount)}</p>
              <RemoveButton label={`Remove ${charge.description}`} confirm={`Remove "${charge.description}" from the bill?`}
                onRemove={() => removeCharge(charge.id)} />
            </div>
          ))}
          <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
            <p className="font-semibold text-gray-900">Total</p>
            <p className="text-lg font-bold tabular-nums text-gray-900">{formatRupees(total)}</p>
          </div>
        </div>
      )}
      <button type="button"
        onClick={() => {
          // Typed notes are sent first; server actions run in order, so they save before the charge
          void beforeAction()
          sheet.show()
        }}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-white px-4 text-base font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-700">
        <Plus className="h-5 w-5" /> Add charge
      </button>
      {sheet.open && <PriceListSheet visitId={visitId} onAdded={sheet.close} onClose={sheet.close} />}
    </section>
  )
}

// A bin icon with a 48 dp target; asks before removing
export function RemoveButton({ label, confirm, onRemove }: { label: string; confirm: string; onRemove: () => Promise<unknown> }) {
  const [pending, startTransition] = useTransition()
  return (
    <button type="button" disabled={pending} aria-label={label}
      onClick={() => {
        if (!window.confirm(confirm)) return
        startTransition(async () => {
          await onRemove()
        })
      }}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
      <Trash2 className="h-5 w-5" />
    </button>
  )
}
