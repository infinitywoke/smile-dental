'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Check, HelpCircle, X } from 'lucide-react'
import type { VisitSummary } from '@/lib/ai/visit-summary'
import { formatRupees } from '@/lib/pricing'
import { confirmVisitSummary } from '@/lib/actions/smart-notes'
import { Card } from './ui'

function planPrice(p: VisitSummary['plan'][number]): string {
  if (p.price !== null) return formatRupees(p.price)
  if (p.price_min !== null && p.price_max !== null) return `${formatRupees(p.price_min)} – ${formatRupees(p.price_max)}`
  return 'Price not set'
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Remove ${label}`}
      className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
      <X className="h-4 w-4" />
    </button>
  )
}

// The one screen where the doctor checks what Claude understood. Nothing is saved until Confirm,
// and every line can be corrected or removed first.
export function SmartNoteCard({
  visitId,
  initial,
  onCancel,
  onConfirmed,
}: {
  visitId: string
  initial: VisitSummary
  onCancel: () => void
  onConfirmed: () => void
}) {
  const [summary, setSummary] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const update = (patch: Partial<VisitSummary>) => setSummary((s) => ({ ...s, ...patch }))
  const total = summary.procedures_done.reduce((sum, p) => sum + (p.amount ?? 0), 0)

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await confirmVisitSummary(visitId, summary)
      if (result.error) setError(result.error)
      else onConfirmed()
    })
  }

  return (
    <div className="space-y-4 pb-12">
      {summary.warnings.length > 0 && (
        <div role="alert" className="space-y-1.5 rounded-2xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
          {summary.warnings.map((warning) => (
            <p key={warning} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {warning}
            </p>
          ))}
        </div>
      )}

      <Card className="space-y-2">
        <label htmlFor="tidy-note" className="text-sm font-semibold text-gray-900">Tidy note</label>
        <textarea id="tidy-note" value={summary.tidy_note} onChange={(e) => update({ tidy_note: e.target.value })}
          rows={9}
          className="w-full rounded-xl border border-gray-300 p-3 text-base leading-relaxed text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
        <p className="text-xs text-gray-500">Your original words are kept.</p>
      </Card>

      {summary.procedures_done.length > 0 && (
        <Card className="space-y-1 p-0">
          <h2 className="px-4 pt-3 text-sm font-semibold text-gray-900">Done today (goes on the bill)</h2>
          {summary.procedures_done.map((p, i) => (
            <div key={`${p.procedure}-${i}`} className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 last:border-0">
              <p className="min-w-0 flex-1 text-sm text-gray-900">
                {p.procedure}
                {p.tooth && <span className="text-gray-500"> · tooth {p.tooth}</span>}
              </p>
              <label className="flex items-center gap-1 text-sm text-gray-500">
                <span className="sr-only">Amount for {p.procedure}</span>₹
                <input type="number" inputMode="decimal" min={0} value={p.amount ?? ''} placeholder="0"
                  onChange={(e) => {
                    const value = e.target.value === '' ? null : Number(e.target.value)
                    update({ procedures_done: summary.procedures_done.map((x, j) => (j === i ? { ...x, amount: value } : x)) })
                  }}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums text-gray-900" />
              </label>
              <RemoveButton label={p.procedure} onClick={() => update({ procedures_done: summary.procedures_done.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <div className="flex justify-between rounded-b-2xl bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-900">
            <span>Total</span>
            <span className="tabular-nums">{formatRupees(total)}</span>
          </div>
        </Card>
      )}

      {summary.plan.length > 0 && (
        <Card className="space-y-1 p-0">
          <h2 className="px-4 pt-3 text-sm font-semibold text-gray-900">Still to do</h2>
          {summary.plan.map((p, i) => (
            <div key={`${p.procedure}-${i}`} className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 last:border-0">
              <p className="min-w-0 flex-1 text-sm text-gray-900">
                {p.procedure}
                {p.tooth && <span className="text-gray-500"> · tooth {p.tooth}</span>}
              </p>
              <p className="shrink-0 text-sm tabular-nums text-gray-700">{planPrice(p)}</p>
              <RemoveButton label={p.procedure} onClick={() => update({ plan: summary.plan.filter((_, j) => j !== i) })} />
            </div>
          ))}
        </Card>
      )}

      {summary.medicines.length > 0 && (
        <Card className="space-y-1 p-0">
          <h2 className="px-4 pt-3 text-sm font-semibold text-gray-900">Medicines</h2>
          {summary.medicines.map((m, i) => (
            <div key={`${m.name}-${i}`} className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 last:border-0">
              <p className="min-w-0 flex-1 text-sm text-gray-900">
                <span className="font-medium">{m.name}</span>
                <span className="text-gray-600"> {[m.dose, m.frequency, m.duration].filter(Boolean).join(' · ')}</span>
                {m.instructions && <span className="block text-xs text-gray-500">{m.instructions}</span>}
              </p>
              <RemoveButton label={m.name} onClick={() => update({ medicines: summary.medicines.filter((_, j) => j !== i) })} />
            </div>
          ))}
        </Card>
      )}

      {(summary.patient_updates?.medical_alerts_add.length ?? 0) > 0 && (
        <Card className="space-y-1 text-sm">
          <h2 className="font-semibold text-gray-900">Add to the patient&apos;s medical alerts</h2>
          {summary.patient_updates!.medical_alerts_add.map((alert, i) => (
            <div key={`${alert}-${i}`} className="flex items-center gap-2">
              <p className="flex-1 text-gray-800">{alert}</p>
              <RemoveButton label={alert} onClick={() => update({
                patient_updates: {
                  ...summary.patient_updates!,
                  medical_alerts_add: summary.patient_updates!.medical_alerts_add.filter((_, j) => j !== i),
                },
              })} />
            </div>
          ))}
        </Card>
      )}

      {summary.unclear.length > 0 && (
        <div className="space-y-1.5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">Not sure about</p>
          {summary.unclear.map((item) => (
            <p key={item} className="flex gap-2">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" /> {item}
            </p>
          ))}
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} disabled={pending}
          className="flex-1 rounded-full bg-white px-4 py-3 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-60">
          Back to my words
        </button>
        <button type="button" onClick={confirm} disabled={pending}
          className="flex flex-[2] items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
          <Check className="h-5 w-5" /> {pending ? 'Saving…' : 'Confirm and bill'}
        </button>
      </div>
    </div>
  )
}
