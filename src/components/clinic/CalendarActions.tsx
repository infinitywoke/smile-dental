'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { blockDay, blockTime, cancelAppointment, reopenDay, unblockTime } from '@/lib/actions/appointments'
import { BLOCK_MINUTES } from '@/lib/schedule'

function useAction() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (work: () => Promise<{ error?: string }>, then?: () => void) => {
    setError(null)
    startTransition(async () => {
      const result = await work()
      if (result.error) setError(result.error)
      else if (then) then()
      else router.refresh()
    })
  }
  return { router, pending, error, run }
}

// After Cancel, a screen offers to tell the patient on WhatsApp (and leads back to their page).
// `backTo` is no longer needed; it is kept so existing callers still fit.
export function CancelAppointmentButton({ appointmentId }: { appointmentId: string; backTo?: string }) {
  const { router, pending, error, run } = useAction()
  return (
    <div className="space-y-2">
      <button type="button" disabled={pending}
        onClick={() => {
          if (!window.confirm('Cancel this appointment? The time becomes free again.')) return
          run(() => cancelAppointment(appointmentId), () => router.replace(`/app/appointments/${appointmentId}/cancelled`))
        }}
        className="min-h-12 w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 disabled:opacity-60">
        {pending ? 'Cancelling…' : 'Cancel appointment'}
      </button>
      {error && <p className="text-center text-sm text-red-700" role="alert">{error}</p>}
    </div>
  )
}

// Close or reopen a whole day (holiday); closed days disappear from the website. Closing is
// refused, with the reason, while patients are booked or website requests wait that day.
export function DayOffButton({ date, dayOff, reopenLabel = 'Reopen this day' }: { date: string; dayOff: boolean; reopenLabel?: string }) {
  const { pending, error, run } = useAction()
  return (
    <div className="space-y-2">
      <button type="button" disabled={pending}
        onClick={() => run(() => (dayOff ? reopenDay(date) : blockDay(date)))}
        className="min-h-12 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 disabled:opacity-60">
        {pending ? '…' : dayOff ? reopenLabel : 'Close this day'}
      </button>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  )
}

// Reopen one blocked time (only that time; a closed day stays closed)
export function UnblockButton({ instant }: { instant: string }) {
  const { pending, error, run } = useAction()
  return (
    <div className="space-y-2">
      <button type="button" disabled={pending} onClick={() => run(() => unblockTime(instant))}
        className="min-h-12 rounded-full bg-white px-5 py-2 text-sm font-semibold text-blue-700 ring-1 ring-gray-300 disabled:opacity-60">
        {pending ? '…' : 'Reopen'}
      </button>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
  )
}

// Blocks one 30-minute block so the website stops offering it
export function BlockThisTimeButton({ startsAt, backTo }: { startsAt: string; backTo: string }) {
  const { router, pending, error, run } = useAction()
  const end = new Date(new Date(startsAt).getTime() + BLOCK_MINUTES * 60_000).toISOString()
  return (
    <div className="space-y-2">
      <button type="button" disabled={pending}
        onClick={() => run(() => blockTime(startsAt, end, 'Blocked'), () => router.replace(backTo))}
        className="min-h-12 w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 disabled:opacity-60">
        {pending ? 'Blocking…' : 'Block this time instead'}
      </button>
      {error && <p className="text-center text-sm text-red-700" role="alert">{error}</p>}
    </div>
  )
}
