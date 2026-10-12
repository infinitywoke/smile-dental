'use client'

import { useMemo, useRef, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { VisitBill } from '@/lib/data/billing'
import { removeCharge } from '@/lib/actions/billing'
import { formatRupees } from '@/lib/pricing'
import { useBackToClose } from './FullScreen'
import { PriceListSheet } from './PriceListSheet'

// Runs a save after the typed notes, and lets Send on WhatsApp wait for it (see VisitFlow)
export type Save = <T>(action: () => Promise<T>) => Promise<T>

// One id per intended charge or payment, made on the phone. Trying the same thing again (after
// "Couldn't reach the server") reuses the id, so a save whose reply was lost is never stored twice.
// Something different (another amount or item) gets a new id.
export type SaveId = { idFor: (what: string) => string; done: () => void }

export function useSaveId(): SaveId {
  const last = useRef<{ what: string; id: string } | null>(null)
  return useMemo(
    () => ({
      idFor(what: string) {
        if (last.current?.what !== what) last.current = { what, id: crypto.randomUUID() }
        return last.current.id
      },
      // Saved: the next one is a new charge or payment
      done() {
        last.current = null
      },
    }),
    [],
  )
}

// The bill: its lines and total, and "Add charge", which opens the clinic price list
export function BillSection({
  visitId,
  charges,
  total,
  save,
}: {
  visitId: string
  charges: VisitBill['charges']
  total: number
  save: Save
}) {
  const sheet = useBackToClose()
  // Kept here, not in the sheet, so closing and reopening the list still recognises a retry
  const saveId = useSaveId()

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
                onRemove={() => save(() => removeCharge(charge.id))} />
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
          void save(async () => {})
          sheet.show()
        }}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-white px-4 text-base font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-700">
        <Plus className="h-5 w-5" /> Add charge
      </button>
      {sheet.open && <PriceListSheet visitId={visitId} save={save} saveId={saveId} onAdded={sheet.close} onClose={sheet.close} />}
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
