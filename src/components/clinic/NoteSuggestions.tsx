'use client'

import { useState } from 'react'
import { Check, Plus, Sparkles, X } from 'lucide-react'
import type { NoteSuggestions as Suggestions } from '@/lib/actions/smart-notes'
import { addCharge, removeCharge } from '@/lib/actions/billing'
import { parseAmount } from '@/lib/billing'
import { formatRupees } from '@/lib/pricing'
import type { Save } from './BillTools'
import { useUndo } from './UndoBar'

// What Gemini heard in the recording, each part where it belongs: the charges in the Bill (here), the next
// visit as the Next visit card's suggestion (NextVisit), and words it couldn't make out under the notes
// (NoteUnclear). Nothing is billed until he taps; each tap can be undone.
export function NoteCharges({
  visitId,
  charges: suggested,
  notOnList,
  save,
  onDismiss,
}: {
  visitId: string
  charges: Suggestions['charges']
  notOnList: Suggestions['notOnList']
  save: Save
  onDismiss: () => void
}) {
  const offerUndo = useUndo()
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [ids] = useState(() => Object.fromEntries(suggested.map((c) => [c.key, crypto.randomUUID()])))
  const [otherIds] = useState(() => notOnList.map(() => crypto.randomUUID()))

  const charges = suggested.filter((c) => !done[c.key])
  const others = notOnList.filter((_, i) => !done[`other-${i}`])
  if (charges.length === 0 && others.length === 0) return null

  // Not on the price list: added as another charge with the amount he types
  async function addOther(index: number, description: string) {
    const key = `other-${index}`
    const amount = parseAmount(amounts[key] ?? '')
    if (amount === null || amount <= 0) {
      setError(`Please type the amount for ${description}.`)
      return
    }
    setError(null)
    const id = otherIds[index]
    const result = await save(() => addCharge(visitId, { description: description.charAt(0).toUpperCase() + description.slice(1), amount, treatmentSlug: null }, id))
    if (result.error) {
      setError(result.error)
      return
    }
    setDone((d) => ({ ...d, [key]: true }))
    offerUndo(`Added ${description}: ${formatRupees(amount)}`, () => save(() => removeCharge(id)))
  }

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

  // Every charge with its price and no doubt about it, in one tap, with one Undo for them all
  const sure = charges.filter((c) => c.amount !== null && !c.guess)
  async function addAll() {
    setError(null)
    const added: { key: string; id: string }[] = []
    for (const c of sure) {
      const id = ids[c.key]
      const result = await save(() => addCharge(visitId, { description: c.description, amount: c.amount!, treatmentSlug: c.treatmentSlug }, id))
      if (result.error) {
        setError(result.error)
        break
      }
      added.push({ key: c.key, id })
    }
    if (added.length === 0) return
    setDone((d) => ({ ...d, ...Object.fromEntries(added.map((a) => [a.key, true])) }))
    offerUndo(`Added ${added.length} charge${added.length === 1 ? '' : 's'} from your notes`, async () => {
      for (const a of added) {
        const result = await save(() => removeCharge(a.id))
        if (result.error) return result
      }
      return {}
    })
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-gray-200" aria-label="Charges from your notes">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-base font-bold text-gray-900"><Sparkles className="h-5 w-5 text-gray-500" aria-hidden="true" /> From your notes</h3>
        <button type="button" onClick={onDismiss} aria-label="Dismiss suggested charges"
          className="flex h-12 w-12 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
          <X className="h-5 w-5" />
        </button>
      </div>

      {sure.length >= 2 && (
        <button type="button" onClick={() => void addAll()}
          className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-base font-bold text-white">
          <Plus className="h-5 w-5" aria-hidden="true" /> Add all {sure.length} charges
        </button>
      )}

      {charges.map((c) => (
        <div key={c.key} className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-gray-200">
          <p className="text-base text-gray-900">
            {c.description}
            {c.guess && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800">best guess: check</span>}
            <span className="block text-sm text-gray-600">{c.amount !== null ? formatRupees(c.amount) : `Price ${c.priceText}: type the amount`}</span>
          </p>
          <div className="flex gap-2">
            {c.amount === null && (
              <input inputMode="decimal" placeholder="Amount" aria-label={`Amount for ${c.description}`} value={amounts[c.key] ?? ''}
                onChange={(e) => setAmounts((a) => ({ ...a, [c.key]: e.target.value }))}
                className="block min-h-12 w-32 rounded-xl border-0 px-3 text-base ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600" />
            )}
            <button type="button" onClick={() => void add(c)}
              className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white">
              <Plus className="h-5 w-5" /> Add charge
            </button>
          </div>
        </div>
      ))}

      {notOnList.map((item, i) =>
        done[`other-${i}`] ? null : (
          <div key={`other-${i}`} className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-gray-200">
            <p className="text-base text-gray-900">
              {item}
              <span className="block text-sm text-gray-600">Not on your price list: add it as a charge with its amount</span>
            </p>
            <div className="flex gap-2">
              <input inputMode="decimal" placeholder="Amount" aria-label={`Amount for ${item}`} value={amounts[`other-${i}`] ?? ''}
                onChange={(e) => setAmounts((a) => ({ ...a, [`other-${i}`]: e.target.value }))}
                className="block min-h-12 w-32 rounded-xl border-0 px-3 text-base ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-blue-600" />
              <button type="button" onClick={() => void addOther(i, item)}
                className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white">
                <Plus className="h-5 w-5" /> Add charge
              </button>
            </div>
          </div>
        ),
      )}

      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <p className="flex items-center gap-1 text-xs text-gray-500"><Check className="h-3.5 w-3.5" /> Suggestions only: check before you tap.</p>
    </section>
  )
}

// Under the notes: what Gemini couldn't make out, so he can correct the notes
export function NoteUnclear({ items, onDismiss }: { items: string[]; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-1 rounded-xl bg-amber-50 py-1 pl-3 pr-1 text-sm text-amber-900 ring-1 ring-amber-200" role="note">
      <div className="min-w-0 flex-1 py-2">
        <p className="font-semibold">Couldn&apos;t make out (please check the notes):</p>
        <ul className="mt-1 list-disc pl-5">{items.map((u) => <li key={u}>{u}</li>)}</ul>
        <p className="mt-1">Words marked (?) in the notes are best guesses.</p>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-amber-900 hover:bg-amber-100">
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}
