'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addFixedCost, stopFixedCost, updateFixedCost, type FixedCostInput } from '@/lib/actions/costs'
import { COST_CATEGORIES, type FixedCost } from '@/lib/costs'
import { formatQty } from '@/lib/stock'

const inputClass =
  'block min-h-12 w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'
const labelClass = 'text-sm font-semibold text-gray-700'
const chip = (on: boolean) =>
  `min-h-11 rounded-full px-4 text-base font-medium ring-1 ring-inset transition-colors ${on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'}`
// Supplies and lab fees are paid as they come, not as regular bills
const KINDS = COST_CATEGORIES.filter((c) => c.value !== 'stock' && c.value !== 'lab')

// A regular bill: what it is, the usual amount, and when it is due (every month or every year)
export function FixedCostForm({ bill, today }: { bill?: FixedCost; today: string }) {
  const router = useRouter()
  const [fields, setFields] = useState<FixedCostInput>({
    name: bill?.name ?? '',
    category: bill?.category ?? 'rent',
    amount: bill ? formatQty(bill.amount) : '',
    every: bill?.every ?? 'month',
    firstDue: bill?.starts_on ?? today,
  })
  const [error, setError] = useState('')
  const [stopping, setStopping] = useState(false)
  const [pending, startTransition] = useTransition()
  const set = (key: keyof FixedCostInput) => (value: string) => setFields((f) => ({ ...f, [key]: value }))

  function save(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      const result = bill ? await updateFixedCost(bill.id, fields) : await addFixedCost(fields)
      if (!result.ok) return setError(result.error)
      navigator.vibrate?.(10)
      if (!bill) setFields((f) => ({ ...f, name: '', amount: '' }))
      router.replace('/app/costs/regular')
    })
  }

  function stop() {
    if (!bill) return
    startTransition(async () => {
      const result = await stopFixedCost(bill.id)
      if (!result.ok) return setError(result.error)
      router.replace('/app/costs/regular')
    })
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="bill-name" className={labelClass}>Bill</label>
        <input id="bill-name" value={fields.name} onChange={(e) => set('name')(e.target.value)} autoComplete="off" autoCapitalize="sentences" placeholder="Clinic rent" className={inputClass} />
      </div>

      <fieldset className="space-y-1.5">
        <legend className={labelClass}>Kind</legend>
        <div className="flex flex-wrap gap-2 pt-1.5">
          {KINDS.map((c) => (
            <button key={c.value} type="button" aria-pressed={fields.category === c.value} onClick={() => set('category')(c.value)} className={chip(fields.category === c.value)}>{c.label}</button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="bill-amount" className={labelClass}>Usual amount (₹)</label>
        <input id="bill-amount" value={fields.amount} onChange={(e) => set('amount')(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="15000" className={inputClass} />
      </div>

      <fieldset className="space-y-1.5">
        <legend className={labelClass}>Every</legend>
        <div className="flex gap-2 pt-1.5">
          {[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }].map((o) => (
            <button key={o.value} type="button" aria-pressed={fields.every === o.value} onClick={() => set('every')(o.value)} className={`${chip(fields.every === o.value)} flex-1`}>{o.label}</button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="bill-due" className={labelClass}>Due on</label>
        <input id="bill-due" type="date" value={fields.firstDue} onChange={(e) => set('firstDue')(e.target.value)} className={inputClass} />
        <p className="text-xs text-gray-500">{fields.every === 'month' ? 'Due on this day every month, from this date.' : 'Due on this date every year.'}</p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800 ring-1 ring-red-200">{error}</p>}

      <button type="submit" disabled={pending || !fields.name.trim() || !fields.amount.trim()}
        className="min-h-14 w-full rounded-full bg-blue-600 px-5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500">
        {pending && !stopping ? 'Saving…' : bill ? 'Save changes' : 'Add bill'}
      </button>

      {bill && !bill.ends_on && (
        <div className="border-t border-gray-200 pt-5">
          {stopping ? (
            <div className="space-y-3 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
              <p className="text-sm text-red-900">Stop “{bill.name}” from today? What you paid for it stays.</p>
              <div className="flex gap-2">
                <button type="button" onClick={stop} disabled={pending} className="min-h-12 flex-1 rounded-full bg-red-600 px-4 text-base font-semibold text-white disabled:opacity-60">
                  {pending ? 'Stopping…' : 'Yes, stop it'}
                </button>
                <button type="button" onClick={() => setStopping(false)} className="min-h-12 flex-1 rounded-full bg-white px-4 text-base font-semibold text-gray-700 ring-1 ring-gray-300">Keep it</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setStopping(true)} className="min-h-12 w-full rounded-full px-4 text-base font-semibold text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50">
              Stop this bill
            </button>
          )}
        </div>
      )}
    </form>
  )
}
