'use client'

import { useState, useTransition } from 'react'
import { ClipboardCheck, MinusCircle, PlusCircle } from 'lucide-react'
import { addStock, countStock, removeStockMove, takeOffStock } from '@/lib/actions/stock'
import { formatQty, pluralUnit, qtyWithUnit } from '@/lib/stock'
import { FullScreen, useBackToClose } from './FullScreen'

const inputClass =
  'block min-h-12 w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'
const labelClass = 'text-sm font-semibold text-gray-700'
const button = 'flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl bg-white text-sm font-bold text-gray-900 ring-1 ring-gray-200 transition-transform active:scale-[0.97]'
const save = 'min-h-14 w-full rounded-full bg-blue-600 px-5 text-base font-semibold text-white shadow-sm disabled:opacity-60'

type Sheet = 'in' | 'use' | 'count'

// Add stock, Used and Count for one item; each opens a short form over the screen
export function StockActions({ itemId, unit, onHand, lastPrice }: { itemId: string; unit: string; onHand: number; lastPrice: number | null }) {
  const { open, show, close } = useBackToClose()
  const [sheet, setSheet] = useState<Sheet>('in')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [wasted, setWasted] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const units = pluralUnit(unit)

  function start(which: Sheet) {
    setSheet(which)
    setQty('')
    setPrice(which === 'in' && lastPrice !== null ? formatQty(lastPrice) : '')
    setExpiresOn('')
    setWasted(false)
    setError('')
    show()
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      const result = sheet === 'in' ? await addStock(itemId, { qty, price, expiresOn })
        : sheet === 'use' ? await takeOffStock(itemId, { qty, wasted })
        : await countStock(itemId, qty)
      if (!result.ok) return setError(result.error)
      navigator.vibrate?.(10)
      close()
    })
  }

  const title = sheet === 'in' ? 'Add stock' : sheet === 'use' ? 'Used or thrown away' : 'Count'
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => start('in')} className={button}>
          <PlusCircle className="h-5 w-5 text-gray-500" aria-hidden="true" />Add stock
        </button>
        <button type="button" onClick={() => start('use')} className={button}>
          <MinusCircle className="h-5 w-5 text-gray-500" aria-hidden="true" />Used
        </button>
        <button type="button" onClick={() => start('count')} className={button}>
          <ClipboardCheck className="h-5 w-5 text-gray-500" aria-hidden="true" />Count
        </button>
      </div>

      {open && (
        <FullScreen title={title} onClose={close}>
          <form onSubmit={submit} className="space-y-5 p-4">
            {sheet === 'count' ? (
              <div className="space-y-1.5">
                <label htmlFor="stock-move-qty" className={labelClass}>How many {units} are there now?</label>
                <input id="stock-move-qty" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" autoComplete="off" autoFocus
                  placeholder={formatQty(onHand)} className={inputClass} />
                <p className="text-sm text-gray-500">The app has {qtyWithUnit(onHand, unit)}. Your count replaces it.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="stock-move-qty" className={labelClass}>{sheet === 'in' ? `How many ${units} came in?` : `How many ${units}?`}</label>
                <input id="stock-move-qty" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" autoComplete="off" autoFocus
                  placeholder={sheet === 'in' ? '10' : '1'} className={inputClass} />
              </div>
            )}

            {sheet === 'in' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="stock-move-price" className={labelClass}>Price each (₹)</label>
                  <input id="stock-move-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" autoComplete="off" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="stock-move-expiry" className={labelClass}>Expires (if it does)</label>
                  <input id="stock-move-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={inputClass} />
                </div>
              </div>
            )}

            {sheet === 'use' && (
              <fieldset className="flex gap-2">
                <legend className="sr-only">What happened</legend>
                {[{ on: false, label: 'Used' }, { on: true, label: 'Thrown away' }].map((o) => (
                  <button key={o.label} type="button" aria-pressed={wasted === o.on} onClick={() => setWasted(o.on)}
                    className={`min-h-12 flex-1 rounded-full px-4 text-base font-medium ring-1 ring-inset ${wasted === o.on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'}`}>
                    {o.label}
                  </button>
                ))}
              </fieldset>
            )}

            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800 ring-1 ring-red-200">{error}</p>}
            <button type="submit" disabled={pending || !qty.trim()} className={save}>
              {pending ? 'Saving…' : sheet === 'in' ? 'Add' : sheet === 'use' ? 'Take off stock' : 'Save count'}
            </button>
          </form>
        </FullScreen>
      )}
    </>
  )
}

// Takes back a move made here, after a second tap
export function RemoveMoveButton({ moveId }: { moveId: string }) {
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="min-h-10 shrink-0 rounded-full px-3 text-sm font-semibold text-gray-500 hover:bg-gray-100">
        Remove
      </button>
    )
  }
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button type="button" disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await removeStockMove(moveId)
          if (!result.ok) setError(result.error)
        })}
        className="min-h-10 rounded-full bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? 'Removing…' : 'Yes, remove'}
      </button>
      {error && <span role="alert" className="max-w-48 text-right text-xs text-red-700">{error}</span>}
    </span>
  )
}
