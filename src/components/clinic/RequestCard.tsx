'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertCircle, AlertTriangle, CalendarCheck, ChevronDown, MessageCircle } from 'lucide-react'
import { confirmRequestAsAsked } from '@/lib/actions/appointments'
import { TestBadge } from './ui'

type Props = {
  id: string
  name: string
  isTest: boolean
  // "Tue 13 Oct, 11:10 AM", or null when no time was asked for
  whenLabel: string | null
  reason: string | null
  alerts: string | null
  // False when the asked-for time has passed or is no longer free
  canConfirm: boolean
  otherTimeHref: string
  details: { age: string | null; address: string | null; heardFrom: string | null; notes: string | null }
}

// A website booking on Today: Confirm books the time asked for in one tap
export function RequestCard({ id, name, isTest, whenLabel, reason, alerts, canConfirm, otherTimeHref, details }: Props) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ whatsappUrl?: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await confirmRequestAsAsked(id)
      if (result.error) {
        setError(result.error)
        return
      }
      setDone({ whatsappUrl: result.whatsappUrl })
      // The patient's chat opens with the confirmation ready; the doctor taps Send
      if (result.whatsappUrl) window.location.assign(result.whatsappUrl)
    })
  }

  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-green-50 p-4 ring-1 ring-green-200">
        <CalendarCheck className="h-6 w-6 shrink-0 text-green-600" />
        <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900">
          {name} is booked{whenLabel ? ` · ${whenLabel}` : ''}
        </p>
        {done.whatsappUrl && (
          <a href={done.whatsappUrl} className="flex shrink-0 items-center gap-1.5 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white">
            <MessageCircle className="h-4 w-4" /> Send
          </a>
        )}
      </div>
    )
  }

  const hasDetails = details.age || details.address || details.heardFrom || details.notes

  return (
    <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-300">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <span className="truncate">{name}</span>
            {isTest && <TestBadge />}
          </p>
          <p className="text-sm text-amber-900">
            {whenLabel ?? 'No time chosen'}
            {reason ? ` · ${reason}` : ''}
          </p>
        </div>
        {hasDetails && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Details"
            className="rounded-full p-1.5 text-amber-800 hover:bg-amber-100">
            <ChevronDown className={`h-5 w-5 transition ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {alerts && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-sm text-red-800 ring-1 ring-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-semibold">Medical alert:</span> {alerts}</span>
        </p>
      )}

      {open && (
        <dl className="mt-2 space-y-0.5 text-sm text-gray-700">
          {details.age && <p><span className="text-gray-500">Age:</span> {details.age}</p>}
          {details.address && <p><span className="text-gray-500">Address:</span> {details.address}</p>}
          {details.heardFrom && <p><span className="text-gray-500">Heard from:</span> {details.heardFrom}</p>}
          {details.notes && <p><span className="text-gray-500">Note:</span> {details.notes}</p>}
        </dl>
      )}

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {canConfirm && (
          <button type="button" onClick={confirm} disabled={pending}
            className="flex-1 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
            {pending ? 'Booking…' : 'Confirm'}
          </button>
        )}
        <Link href={otherTimeHref}
          className="flex-1 rounded-full bg-white px-4 py-2.5 text-center text-sm font-semibold text-gray-900 ring-1 ring-gray-300">
          Other time
        </Link>
      </div>
    </div>
  )
}
