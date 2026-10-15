'use client'

import { useState } from 'react'
import { CalendarPlus, Check, Plus, Sparkles, X } from 'lucide-react'
import type { NoteSuggestions as Suggestions } from '@/lib/actions/smart-notes'
import { addCharge, removeCharge } from '@/lib/actions/billing'
import { bookNextVisit, removeNextVisit } from '@/lib/actions/visits'
import { parseAmount } from '@/lib/billing'
import { formatRupees } from '@/lib/pricing'
import { formatBlock, formatDay, inIndia, lengthLabel } from '@/lib/schedule'
import type { Save } from './BillTools'
import { useUndo } from './UndoBar'

// What Gemini suggested from the recorded notes: charges (the clinic's own prices) and a next visit.
// Nothing happens until he taps; each tap can be undone.
export function NoteSuggestions({
  visitId,
  suggestions,
  hasNextVisit,
  save,
  onDismiss,
}: {
  visitId: string
  suggestions: Suggestions
  // A next visit is already booked: the suggestion isn't shown
  hasNextVisit: boolean
  save: Save
  onDismiss: () => void
}) {
  const offerUndo = useUndo()
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [ids] = useState(() => Object.fromEntries(suggestions.charges.map((c) => [c.key, crypto.randomUUID()])))

  const charges = suggestions.charges.filter((c) => !done[c.key])
  const next = !hasNextVisit && !done.next && suggestions.nextVisit?.instant ? suggestions.nextVisit : null
  if (charges.length === 0 && !next) return null

  async function add(c: Suggestions['charges'][number]) {
    const amount = c.amount ?? parseAmount(amounts[c.key] ?? '')
    if (amount === null || amount <= 0) {
      setError(`Please type the amount for ${c.description}.`)
      return
    }
    setError(null)
    const id = ids[c.key]
    const result = await save(() => addCharge(visitId, { description: c.description, amount, treatmentSlug: c.treatmentSlug }, id))
    if (result.error) {
      setError(result.error)
      return
    }
    setDone((d) => ({ ...d, [c.key]: true }))
    offerUndo(`Added ${c.description}: ${formatRupees(amount)}`, () => save(() => removeCharge(id)))
  }

  async function book() {
    if (!next?.instant) return
    setError(null)
    const result = await save(() => bookNextVisit(visitId, next.instant!, next.minutes))
    if (result.error) {
      setError(result.error)
      return
    }
    setDone((d) => ({ ...d, next: true }))
    offerUndo('Next visit booked from your notes', () => save(() => removeNextVisit(visitId)))
  }

  const when = (iso: string) => {
    const { date, time } = inIndia(iso)
    return `${formatDay(date)}, ${formatBlock(time)}`
  }

  return (
    <section className="space-y-3 rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-200" aria-label="Suggestions from your notes">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-base font-bold text-violet-900"><Sparkles className="h-5 w-5" /> From your notes</h3>
        <button type="button" onClick={onDismiss} aria-label="Dismiss suggestions"
          className="flex h-12 w-12 items-center justify-center rounded-full text-violet-700 hover:bg-violet-100">
          <X className="h-5 w-5" />
        </button>
      </div>

      {charges.map((c) => (
        <div key={c.key} className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-violet-100">
          <p className="text-base text-gray-900">
            {c.description}
            <span className="block text-sm text-gray-600">{c.amount !== null ? formatRupees(c.amount) : `Price ${c.priceText}: type the amount`}</span>
          </p>
          <div className="flex gap-2">
            {c.amount === null && (
              <input inputMode="decimal" placeholder="Amount" aria-label={`Amount for ${c.description}`} value={amounts[c.key] ?? ''}
                onChange={(e) => setAmounts((a) => ({ ...a, [c.key]: e.target.value }))}
                className="block min-h-12 w-32 rounded-xl border-0 px-3 text-base ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-violet-600" />
            )}
            <button type="button" onClick={() => void add(c)}
              className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 text-base font-semibold text-white">
              <Plus className="h-5 w-5" /> Add charge
            </button>
          </div>
        </div>
      ))}

      {next?.instant && (
        <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-violet-100">
          <p className="text-base text-gray-900">
            Next visit: {when(next.instant)} ({lengthLabel(next.minutes)})
            {next.why && <span className="block text-sm text-gray-600">{next.why}</span>}
          </p>
          <button type="button" onClick={() => void book()}
            className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 text-base font-semibold text-white">
            <CalendarPlus className="h-5 w-5" /> Book next visit
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <p className="flex items-center gap-1 text-xs text-violet-800"><Check className="h-3.5 w-3.5" /> Suggestions only: check before you tap.</p>
    </section>
  )
}
