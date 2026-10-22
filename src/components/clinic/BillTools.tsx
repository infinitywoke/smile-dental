'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { VisitBill } from '@/lib/data/billing'
import { addCharge, removeCharge } from '@/lib/actions/billing'
import { formatRupees } from '@/lib/pricing'
import type { UsualCharge } from '@/lib/usual-charges'
import { useBackToClose } from './FullScreen'
import { PriceListSheet } from './PriceListSheet'
import { useUndo } from './UndoBar'

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

// The bill: one card with its lines and total and, below them in the same card, the payment (children);
// then his usual charges one tap each, and "Add charge", which opens the clinic price list
export function BillSection({
  visitId,
  charges,
  total,
  usual,
  save,
  fromNotes,
  children,
}: {
  visitId: string
  charges: VisitBill['charges']
  total: number
  // The price-list items he bills most (src/lib/usual-charges.ts)
  usual: UsualCharge[]
  save: Save
  // Charges a recording suggested (src/components/clinic/NoteSuggestions.tsx), until added or dismissed
  fromNotes?: React.ReactNode
  // The payment part of the card (src/components/clinic/PaymentCard.tsx), when there is one
  children?: React.ReactNode
}) {
  const sheet = useBackToClose()
  // Kept here, not in the sheet, so closing and reopening the list still recognises a retry
  const saveId = useSaveId()
  const offerUndo = useUndo()
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // One tap adds a usual charge, as the price list does (same id on a retry, Undo after)
  async function addUsual(item: UsualCharge) {
    if (adding) return
    setError(null)
    setAdding(item.description)
    const chargeId = saveId.idFor(`${item.slug}|${item.description}|${item.amount}`)
    try {
      const result = await save(() => addCharge(visitId, { description: item.description, amount: item.amount, treatmentSlug: item.slug }, chargeId))
      if (result.error) setError(result.error)
      else {
        saveId.done()
        navigator.vibrate?.(10)
        offerUndo(`Added ${item.description}: ${formatRupees(item.amount)}`, () => save(() => removeCharge(chargeId)))
      }
    } catch {
      setError("Couldn't reach the server. Check the internet and try again.")
    } finally {
      setAdding(null)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="hud-heading">Bill</h2>
      {fromNotes}
      {(charges.length > 0 || children) && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          {charges.map((charge) => (
            <div key={charge.id} className="flex items-center gap-2 border-b border-gray-100 py-1 pl-4 pr-1">
              <p className="min-w-0 flex-1 text-base text-gray-900">{charge.description}</p>
              <p className="shrink-0 text-base font-semibold tabular-nums text-gray-900">{formatRupees(charge.amount)}</p>
              <RemoveButton label={`Remove ${charge.description}`} confirm={`Remove "${charge.description}" from the bill?`}
                onRemove={() => save(() => removeCharge(charge.id))} />
            </div>
          ))}
          {charges.length > 0 && (
            <div className="flex items-center justify-between bg-gray-100 px-4 py-3">
              <p className="font-semibold text-gray-900">Total</p>
              <p className="text-lg font-bold tabular-nums text-gray-900">{formatRupees(total)}</p>
            </div>
          )}
          {children}
        </div>
      )}
      {usual.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] font-bold text-gray-500">Usual charges</p>
          <div role="group" aria-label="Usual charges" className="grid grid-cols-2 gap-2">
            {usual.map((item) => (
              // The price under the name, so the name has the whole width
              <button key={item.description} type="button" disabled={!!adding} onClick={() => void addUsual(item)}
                className="flex min-h-12 flex-col items-start justify-center rounded-xl bg-white px-3 py-1 text-left ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-60">
                <span className="w-full truncate text-sm font-semibold text-gray-900">{item.label}</span>
                <span className="hud-mono text-xs text-gray-500">{formatRupees(item.amount)}</span>
              </button>
            ))}
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      )}
      <button type="button"
        onClick={() => {
          // Typed notes are sent first; server actions run in order, so they save before the charge
          void save(async () => {})
          sheet.show()
        }}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-base font-semibold text-gray-900 ring-1 ring-gray-200 hover:bg-gray-50">
        <Plus className="h-5 w-5 text-gray-500" aria-hidden="true" /> Add charge
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
