'use client'

import { useState, useTransition } from 'react'
import { ChevronRight, Search, X } from 'lucide-react'
import { removeTreatmentMaterial, setTreatmentMaterial } from '@/lib/actions/stock'
import { chargeName, formatPrice, formatRupees, type PriceListOption } from '@/lib/pricing'
import { materialsCost, pluralUnit, qtyWithUnit, type StockLevel, type TreatmentMaterial } from '@/lib/stock'
import { FullScreen, useBackToClose } from './FullScreen'

const inputClass =
  'block min-h-12 w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'
const SEARCH_FROM = 8
const keyOf = (o: PriceListOption) => `${o.slug}|${o.detail}`
const matches = (text: string, query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.toLowerCase().includes(w))

// What each price-list treatment uses from stock. Adding that treatment to a visit takes these off
// stock (the database does it); removing it from the visit puts them back.
// options: the clinic's price list (src/lib/data/price-list.ts)
export function TreatmentMaterials({ levels, materials, options }: { levels: StockLevel[]; materials: TreatmentMaterial[]; options: PriceListOption[] }) {
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const { open, show, close } = useBackToClose()
  const items = new Map(levels.map((l) => [l.item_id, l]))
  const usesOf = (o: PriceListOption) => materials.filter((m) => m.treatment_slug === o.slug && m.charge_description === chargeName(o))
  const shown = options.filter((o) => matches(`${o.treatment} ${o.detail}`, query))
  const current = openKey ? options.find((o) => keyOf(o) === openKey) : undefined

  return (
    <>
      <label className="relative block">
        <span className="sr-only">Find a treatment</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a treatment"
          className="block min-h-12 w-full rounded-xl border-0 py-3 pr-4 pl-11 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600" />
      </label>

      <ul aria-label="Treatments" className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        {shown.map((o) => {
          const uses = usesOf(o)
          const cost = materialsCost(uses, levels)
          return (
            <li key={keyOf(o)}>
              <button type="button" onClick={() => { setOpenKey(keyOf(o)); show() }} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-gray-900">{o.treatment}</span>
                  {o.detail && <span className="block text-sm text-gray-600">{o.detail}</span>}
                  <span className={`mt-0.5 block text-sm ${uses.length ? 'text-gray-700' : 'text-gray-400'}`}>
                    {uses.length === 0 ? 'Nothing set' : uses.map((u) => {
                      const item = items.get(u.item_id)
                      return item ? `${item.name} ${qtyWithUnit(u.qty, item.unit)}` : 'An item no longer on the list'
                    }).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm">
                  <span className="block font-semibold text-blue-700">{formatPrice(o.price)}</span>
                  {cost.amount > 0 && <span className="block text-gray-500">materials {formatRupees(cost.amount)}</span>}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>

      {open && current && <MaterialsSheet option={current} uses={usesOf(current)} levels={levels} onClose={close} />}
    </>
  )
}

function MaterialsSheet({ option, uses, levels, onClose }: { option: PriceListOption; uses: TreatmentMaterial[]; levels: StockLevel[]; onClose: () => void }) {
  const [adding, setAdding] = useState<StockLevel | null>(null)
  const [qty, setQty] = useState('1')
  const [find, setFind] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const name = chargeName(option)
  const items = new Map(levels.map((l) => [l.item_id, l]))
  const cost = materialsCost(uses, levels)
  const price = option.price.kind === 'fixed' ? option.price.amount : null
  const candidates = levels.filter((l) => !uses.some((u) => u.item_id === l.item_id) && matches(`${l.name} ${l.supplier}`, find))

  function add(event: React.FormEvent) {
    event.preventDefault()
    if (!adding) return
    setError('')
    startTransition(async () => {
      const result = await setTreatmentMaterial({ slug: option.slug, description: name, itemId: adding.item_id, qty })
      if (!result.ok) return setError(result.error)
      setAdding(null)
      setQty('1')
      setFind('')
    })
  }

  function remove(id: string) {
    setError('')
    startTransition(async () => {
      const result = await removeTreatmentMaterial(id)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <FullScreen title={name} onClose={onClose}>
      <div className="space-y-5 p-4">
        <p className="text-sm text-gray-600">What one of these uses. Adding it to a visit takes these off stock; removing it from the visit puts them back.</p>

        {uses.length > 0 && (
          <section aria-label="Uses" className="space-y-2">
            <ul className="divide-y divide-gray-100 rounded-2xl bg-white ring-1 ring-gray-200">
              {uses.map((u) => {
                const item = items.get(u.item_id)
                return (
                  <li key={u.id} className="flex min-h-14 items-center gap-3 py-1 pr-1 pl-4">
                    <span className="min-w-0 flex-1 text-base text-gray-900">{item?.name ?? 'An item no longer on the list'}</span>
                    <span className="hud-mono shrink-0 text-sm font-bold text-gray-900">{item ? qtyWithUnit(u.qty, item.unit) : u.qty}</span>
                    <button type="button" onClick={() => remove(u.id)} disabled={pending} aria-label={`Remove ${item?.name ?? 'this item'}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-60">
                      <X className="h-5 w-5" />
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="text-sm text-gray-700" role="status">
              Materials {formatRupees(cost.amount)} at their last prices{cost.complete ? '' : ' (some have no price yet)'}
              {price !== null && cost.amount > 0 && <> · price {formatRupees(price)}, so {formatRupees(price - cost.amount)} left</>}
            </p>
          </section>
        )}

        {adding ? (
          <form onSubmit={add} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-blue-200">
            <p className="text-base font-semibold text-gray-900">{adding.name}</p>
            <div className="space-y-1.5">
              <label htmlFor="material-qty" className="text-sm font-semibold text-gray-700">How many {pluralUnit(adding.unit)} does one use?</label>
              <input id="material-qty" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" autoComplete="off" autoFocus className={inputClass} />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={pending || !qty.trim()} className="min-h-12 flex-1 rounded-full bg-blue-600 px-4 text-base font-semibold text-white disabled:opacity-60">
                {pending ? 'Adding…' : 'Add'}
              </button>
              <button type="button" onClick={() => setAdding(null)} className="min-h-12 flex-1 rounded-full bg-white px-4 text-base font-semibold text-gray-700 ring-1 ring-gray-300">Cancel</button>
            </div>
          </form>
        ) : levels.length === 0 ? (
          <p className="text-base text-gray-600">Add items on the Stock tab first.</p>
        ) : (
          <section aria-label="Add an item" className="space-y-2">
            <h3 className="text-base font-bold text-gray-900">Add an item</h3>
            {levels.length >= SEARCH_FROM && (
              <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find an item" aria-label="Find an item" className={inputClass} />
            )}
            {candidates.length === 0 ? (
              <p className="text-sm text-gray-500">{find.trim() ? 'No item matches.' : 'Every item is already here.'}</p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-2xl bg-white ring-1 ring-gray-200">
                {candidates.map((l) => (
                  <li key={l.item_id}>
                    <button type="button" onClick={() => { setAdding(l); setQty('1') }} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-gray-50">
                      <span className="min-w-0 flex-1 text-base text-gray-900">{l.name}</span>
                      <span className="shrink-0 text-sm text-gray-500">{pluralUnit(l.unit)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800 ring-1 ring-red-200">{error}</p>}
      </div>
    </FullScreen>
  )
}
