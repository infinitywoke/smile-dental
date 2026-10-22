'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addStockItem, archiveStockItem, updateStockItem, type StockItemInput } from '@/lib/actions/stock'
import { COMMON_UNITS, STOCK_KINDS, formatQty, type StockLevel } from '@/lib/stock'

const inputClass =
  'block min-h-12 w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'
const labelClass = 'text-sm font-semibold text-gray-700'
const chip = (on: boolean) =>
  `min-h-11 rounded-full px-4 text-base font-medium ring-1 ring-inset transition-colors ${on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'}`

// Adding an item (with what is on the shelf now), or changing one. Only the name is needed;
// everything else has a sensible default.
export function StockItemForm({ item }: { item?: StockLevel }) {
  const router = useRouter()
  const [fields, setFields] = useState<StockItemInput>({
    name: item?.name ?? '',
    category: item?.category ?? 'consumable',
    unit: item?.unit ?? 'piece',
    lowLevel: item && item.low_level > 0 ? formatQty(item.low_level) : '',
    supplier: item?.supplier ?? '',
    price: item?.last_unit_cost != null ? formatQty(item.last_unit_cost) : '',
  })
  const [qty, setQty] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState(false)
  const [pending, startTransition] = useTransition()
  const set = (key: keyof StockItemInput) => (value: string) => setFields((f) => ({ ...f, [key]: value }))

  function save(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      if (item) {
        const result = await updateStockItem(item.item_id, fields)
        if (!result.ok) return setError(result.error)
        router.replace(`/app/stock/${item.item_id}`)
      } else {
        const result = await addStockItem(fields, { qty, expiresOn })
        if (!result.ok) return setError(result.error)
        navigator.vibrate?.(10)
        // The screen may be kept for later: the next item starts empty
        setFields((f) => ({ ...f, name: '', lowLevel: '', price: '' }))
        setQty('')
        setExpiresOn('')
        router.replace('/app/stock')
      }
    })
  }

  function remove() {
    if (!item) return
    setError('')
    startTransition(async () => {
      const result = await archiveStockItem(item.item_id)
      if (!result.ok) return setError(result.error)
      router.replace('/app/stock')
    })
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="stock-name" className={labelClass}>Item</label>
        <input id="stock-name" value={fields.name} onChange={(e) => set('name')(e.target.value)} autoComplete="off" autoCapitalize="sentences"
          placeholder="Composite A2 (3M Z350)" className={inputClass} />
      </div>

      <fieldset className="space-y-1.5">
        <legend className={labelClass}>Kind</legend>
        <div className="flex flex-wrap gap-2 pt-1.5">
          {STOCK_KINDS.map((k) => (
            <button key={k.value} type="button" aria-pressed={fields.category === k.value} onClick={() => set('category')(k.value)} className={chip(fields.category === k.value)}>
              {k.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="stock-unit" className={labelClass}>Counted in</label>
        <div className="flex flex-wrap gap-2" aria-hidden="true">
          {COMMON_UNITS.map((u) => (
            <button key={u} type="button" tabIndex={-1} onClick={() => set('unit')(u)} className={chip(fields.unit === u)}>{u}</button>
          ))}
        </div>
        <input id="stock-unit" value={fields.unit} onChange={(e) => set('unit')(e.target.value)} autoComplete="off" maxLength={20} className={inputClass} />
      </div>

      {!item && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="stock-qty" className={labelClass}>How many now</label>
            <input id="stock-qty" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="10" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="stock-expiry" className={labelClass}>Expires (if it does)</label>
            <input id="stock-expiry" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={inputClass} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="stock-low" className={labelClass}>Warn me at</label>
          <input id="stock-low" value={fields.lowLevel} onChange={(e) => set('lowLevel')(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="2" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="stock-price" className={labelClass}>Price each (₹)</label>
          <input id="stock-price" value={fields.price} onChange={(e) => set('price')(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="120" className={inputClass} />
        </div>
      </div>
      <p className="-mt-3 text-xs text-gray-500">At or below “Warn me at”, it shows as low on Today and in the morning notification.</p>

      <div className="space-y-1.5">
        <label htmlFor="stock-supplier" className={labelClass}>Usual supplier</label>
        <input id="stock-supplier" value={fields.supplier} onChange={(e) => set('supplier')(e.target.value)} autoComplete="off" autoCapitalize="words" className={inputClass} />
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800 ring-1 ring-red-200">{error}</p>}

      <button type="submit" disabled={pending || !fields.name.trim()}
        className="min-h-14 w-full rounded-full bg-blue-600 px-5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500">
        {pending && !removing ? 'Saving…' : item ? 'Save changes' : 'Add to stock'}
      </button>

      {item && (
        <div className="border-t border-gray-200 pt-5">
          {removing ? (
            <div className="space-y-3 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
              <p className="text-sm text-red-900">Take “{item.name}” off the stock list? Its history stays, and no treatment will take it off stock any more.</p>
              <div className="flex gap-2">
                <button type="button" onClick={remove} disabled={pending} className="min-h-12 flex-1 rounded-full bg-red-600 px-4 text-base font-semibold text-white disabled:opacity-60">
                  {pending ? 'Removing…' : 'Yes, remove'}
                </button>
                <button type="button" onClick={() => setRemoving(false)} className="min-h-12 flex-1 rounded-full bg-white px-4 text-base font-semibold text-gray-700 ring-1 ring-gray-300">Keep it</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setRemoving(true)} className="min-h-12 w-full rounded-full px-4 text-base font-semibold text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50">
              Remove from the list
            </button>
          )}
        </div>
      )}
    </form>
  )
}
