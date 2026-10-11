'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, Loader2, Plus, Search } from 'lucide-react'
import { addCharge } from '@/lib/actions/billing'
import { parseAmount } from '@/lib/billing'
import { formatPrice, formatRupees, priceListOptions, type PriceListOption } from '@/lib/pricing'
import type { Save, SaveId } from './BillTools'
import { FullScreen } from './FullScreen'

const inputClass =
  'block w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'

const OTHER = 'other'
const keyOf = (o: PriceListOption) => `${o.slug}|${o.detail}`
const nameOf = (o: PriceListOption) => (o.detail ? `${o.treatment} – ${o.detail}` : o.treatment)

// The clinic price list, full screen. A fixed price is added with one tap; a range or a formula
// asks for the agreed amount; "Other charge" asks what for and how much.
export function PriceListSheet({
  visitId,
  save,
  saveId,
  onAdded,
  onClose,
}: {
  visitId: string
  save: Save
  saveId: SaveId
  onAdded: () => void
  onClose: () => void
}) {
  const options = useMemo(() => priceListOptions(), [])
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown = words.length === 0 ? options : options.filter((o) => words.every((w) => `${o.treatment} ${o.detail}`.toLowerCase().includes(w)))

  async function add(key: string, input: { description: string; amount: number; treatmentSlug: string | null }) {
    if (busy) return
    setError(null)
    setBusy(key)
    // The same charge tapped again after a lost reply keeps its id, so it is saved once
    const chargeId = saveId.idFor(`${input.treatmentSlug}|${input.description}|${input.amount}`)
    try {
      const result = await save(() => addCharge(visitId, input, chargeId))
      if (result.error) setError(result.error)
      else {
        saveId.done()
        onAdded()
      }
    } catch {
      setError("Couldn't reach the server. Check the internet and try again.")
    } finally {
      setBusy(null)
    }
  }

  function tap(option: PriceListOption) {
    if (option.price.kind === 'fixed') {
      void add(keyOf(option), { description: nameOf(option), amount: option.price.amount, treatmentSlug: option.slug })
      return
    }
    open(keyOf(option))
  }

  function open(key: string) {
    setError(null)
    setAmount('')
    setDescription('')
    setExpanded(expanded === key ? null : key)
  }

  function addTyped(key: string, input: { description: string; treatmentSlug: string | null }) {
    const parsed = parseAmount(amount)
    if (parsed === null) {
      setError('Please enter the amount.')
      return
    }
    if (!input.description.trim()) {
      setError('Please say what the charge is for.')
      return
    }
    void add(key, { ...input, amount: parsed })
  }

  const errorLine = error && (
    <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
    </p>
  )

  return (
    <FullScreen title="Add charge" onClose={onClose}>
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter: scaling, RCT, filling…"
            aria-label="Filter the price list" className={`${inputClass} pl-11`} />
        </div>
        {/* A one-tap item that failed to add says so here, in sight */}
        {expanded === null && errorLine && <div className="mt-3">{errorLine}</div>}
      </div>

      <ul className="divide-y divide-gray-100 pb-8">
        <li>
          <button type="button" onClick={() => open(OTHER)} aria-expanded={expanded === OTHER}
            className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-blue-50">
            <Plus className="h-5 w-5 shrink-0 text-blue-700" />
            <span className="flex-1 text-base font-semibold text-blue-700">Other charge</span>
          </button>
          {expanded === OTHER && (
            <div className="space-y-3 bg-gray-50 px-4 py-4">
              <div className="space-y-1.5">
                <label htmlFor="other-description" className="text-sm font-semibold text-gray-700">What for</label>
                <input id="other-description" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus
                  autoComplete="off" placeholder="Lab charge, medicines…" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="other-amount" className="text-sm font-semibold text-gray-700">Amount (₹)</label>
                <input id="other-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                  autoComplete="off" placeholder="500" className={inputClass} />
              </div>
              {errorLine}
              <button type="button" disabled={busy !== null} onClick={() => addTyped(OTHER, { description, treatmentSlug: null })}
                className="h-12 w-full rounded-full bg-blue-600 text-base font-semibold text-white disabled:opacity-60">
                {busy === OTHER ? 'Adding…' : 'Add to bill'}
              </button>
            </div>
          )}
        </li>

        {shown.map((option) => {
          const key = keyOf(option)
          const isOpen = expanded === key
          return (
            <li key={key}>
              <button type="button" onClick={() => tap(option)} disabled={busy !== null} aria-expanded={option.price.kind === 'fixed' ? undefined : isOpen}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-blue-50 disabled:opacity-100">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-gray-900">{option.treatment}</span>
                  {option.detail && <span className="block text-sm text-gray-600">{option.detail}</span>}
                </span>
                <span className="shrink-0 text-right text-sm font-semibold text-blue-700">
                  {busy === key ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Adding" /> : formatPrice(option.price)}
                </span>
              </button>
              {isOpen && (
                <div className="space-y-3 bg-gray-50 px-4 py-4">
                  <div className="space-y-1.5">
                    <label htmlFor="agreed-amount" className="text-sm font-semibold text-gray-700">Amount agreed (₹)</label>
                    <input id="agreed-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus
                      autoComplete="off" placeholder={option.price.kind === 'formula' ? String(option.price.base) : ''} className={inputClass} />
                    <p className="text-sm text-gray-500">Price list: {formatPrice(option.price)}</p>
                  </div>
                  {errorLine}
                  <button type="button" disabled={busy !== null}
                    onClick={() => addTyped(key, { description: nameOf(option), treatmentSlug: option.slug })}
                    className="h-12 w-full rounded-full bg-blue-600 text-base font-semibold text-white disabled:opacity-60">
                    {busy === key ? 'Adding…' : `Add${parseAmount(amount) ? ` ${formatRupees(parseAmount(amount)!)}` : ''}`}
                  </button>
                </div>
              )}
            </li>
          )
        })}
        {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-500">Nothing matches. Use “Other charge”.</li>}
      </ul>
    </FullScreen>
  )
}
