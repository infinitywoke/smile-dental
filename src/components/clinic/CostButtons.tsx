'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteCost, markBillPaid } from '@/lib/actions/costs'
import { PAID_BY, type PaidBy } from '@/lib/costs'
import { FullScreen, useBackToClose } from './FullScreen'

const inputClass =
  'block min-h-12 w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'
const labelClass = 'text-sm font-semibold text-gray-700'

// A regular bill paid: the amount (electricity changes), how, and when (`paidOn` to start with: its due
// day, for a month gone by)
export function MarkPaidButton({ bill, today, paidOn = today }: { bill: { id: string; name: string; amount: number }; today: string; paidOn?: string }) {
  const { open, show, close } = useBackToClose()
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState<PaidBy>('upi')
  const [spentOn, setSpentOn] = useState(today)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const id = useRef<string | null>(null)

  function start() {
    id.current = crypto.randomUUID()
    setAmount(String(bill.amount))
    setSpentOn(paidOn)
    setError('')
    show()
  }

  function save(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await markBillPaid(bill.id, { id: id.current!, amount, paidBy, spentOn })
      if (!result.ok) return setError(result.error)
      navigator.vibrate?.(10)
      close()
    })
  }

  return (
    <>
      <button type="button" onClick={start} className="min-h-11 shrink-0 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
        Mark paid
      </button>
      {open && (
        <FullScreen title={`Paid: ${bill.name}`} onClose={close}>
          <form onSubmit={save} className="space-y-5 p-4">
            <div className="space-y-1.5">
              <label htmlFor="paid-amount" className={labelClass}>Amount paid (₹)</label>
              <input id="paid-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoComplete="off" className={inputClass} />
            </div>
            <fieldset className="space-y-1.5">
              <legend className={labelClass}>Paid by</legend>
              <div className="flex flex-wrap gap-2 pt-1.5">
                {PAID_BY.map((p) => (
                  <button key={p.value} type="button" aria-pressed={paidBy === p.value} onClick={() => setPaidBy(p.value)}
                    className={`min-h-11 rounded-full px-4 text-base font-medium ring-1 ring-inset ${paidBy === p.value ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <label htmlFor="paid-date" className={labelClass}>Paid on</label>
              <input id="paid-date" type="date" value={spentOn} max={today} onChange={(e) => setSpentOn(e.target.value)} className={inputClass} />
            </div>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800 ring-1 ring-red-200">{error}</p>}
            <button type="submit" disabled={pending || !amount.trim()} className="min-h-14 w-full rounded-full bg-blue-600 px-5 text-base font-semibold text-white shadow-sm disabled:opacity-60">
              {pending ? 'Saving…' : 'Save'}
            </button>
          </form>
        </FullScreen>
      )}
    </>
  )
}

// Deletes a cost after a second tap, then goes back to that month's costs
export function DeleteCostButton({ costId, month }: { costId: string; month: string }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="min-h-12 w-full rounded-full px-4 text-base font-semibold text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50">
        Delete this cost
      </button>
    )
  }
  return (
    <div className="space-y-3 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
      <p className="text-sm text-red-900">Delete this cost and its bill photo?</p>
      {error && <p role="alert" className="text-sm font-medium text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending}
          onClick={() => startTransition(async () => {
            const result = await deleteCost(costId)
            if (!result.ok) return setError(result.error)
            router.replace(`/app/costs?m=${month}`)
          })}
          className="min-h-12 flex-1 rounded-full bg-red-600 px-4 text-base font-semibold text-white disabled:opacity-60">
          {pending ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button type="button" onClick={() => setAsking(false)} className="min-h-12 flex-1 rounded-full bg-white px-4 text-base font-semibold text-gray-700 ring-1 ring-gray-300">Keep it</button>
      </div>
    </div>
  )
}
