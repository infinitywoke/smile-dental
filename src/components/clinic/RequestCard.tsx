'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, AlertTriangle, CalendarCheck, ChevronDown, Clock, MessageCircle } from 'lucide-react'
import { confirmRequestAsAsked, declineBookingRequest } from '@/lib/actions/appointments'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { openWhatsApp } from '@/lib/whatsapp-business'

type Props = {
  id: string
  name: string
  // "Tue 13 Oct, 11:10 AM", or null when no time was asked for
  whenLabel: string | null
  reason: string | null
  alerts: string | null
  // False when the asked-for time has passed or is no longer free
  canConfirm: boolean
  otherTimeHref: string
  details: { age: string | null; address: string | null; heardFrom: string | null; notes: string | null }
  // Asked to be called (no WhatsApp)
  callBack?: boolean
  phone?: string | null
  // "Time passed" or "No longer held, asked 2 days ago": shown on the card, with Decline right there
  // How the asked time stands (held, not held yet, passed); stale ones offer Decline
  notice?: { text: string; stale: boolean } | null
}

type Done = { declined: boolean; whatsappUrl?: string; when: string | null }

// A website booking on Today: Confirm books the time asked for in one tap
export function RequestCard({ id, name, whenLabel, reason, alerts, canConfirm, otherTimeHref, details, notice = null, callBack = false, phone = null }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [pending, startTransition] = useTransition()

  function finish(result: { declined?: boolean; whatsappUrl?: string; startsAt?: string }, fromDecline = false) {
    const booked = result.startsAt ? inIndia(result.startsAt) : null
    setDone({
      declined: !!result.declined,
      whatsappUrl: result.whatsappUrl,
      when: booked ? `${formatDay(booked.date)}, ${formatBlock(booked.time)}` : whenLabel,
    })
    // The patient's chat opens with the message ready; the "Open WhatsApp" button below is the fallback.
    // A request found declined after tapping Confirm (another tab) keeps its message one tap away.
    if (result.whatsappUrl && (!result.declined || fromDecline)) openWhatsApp(result.whatsappUrl)
  }

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await confirmRequestAsAsked(id)
      if (result.error) {
        setError(result.error)
        return
      }
      // The number already belongs to a patient: the request page asks who this is
      if (result.needsChoice) {
        router.push(otherTimeHref)
        return
      }
      finish(result)
    })
  }

  function decline() {
    if (!window.confirm(`Decline ${name}'s request? You can send them a message to call the clinic.`)) return
    setError(null)
    startTransition(async () => {
      const result = await declineBookingRequest(id)
      if (result.error) setError(result.error)
      else finish(result, true)
    })
  }

  if (done) {
    return (
      <div className="space-y-3 rounded-2xl bg-green-50 p-4 ring-1 ring-green-200">
        <div className="flex items-center gap-3">
          <CalendarCheck className="h-6 w-6 shrink-0 text-green-600" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900">
            {done.declined ? `${name}: request declined` : `${name} is booked${done.when ? ` · ${done.when}` : ''}`}
          </p>
        </div>
        {done.whatsappUrl && (
          <a href={done.whatsappUrl} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-green-600 px-4 py-3 text-base font-semibold text-white">
            <MessageCircle className="h-5 w-5" /> Open WhatsApp
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
          <p className="truncate text-base font-semibold text-gray-900">{name}</p>
          <p className="text-sm text-amber-900">
            {whenLabel ?? 'No time chosen'}
            {reason ? ` · ${reason}` : ''}
          </p>
          {callBack && <p className="mt-1 text-sm font-semibold text-blue-800">📞 No WhatsApp: call to confirm</p>}
        </div>
        {callBack && phone && (
          <a href={`tel:+91${phone}`} aria-label={`Call ${name}`}
            className="flex min-h-12 shrink-0 items-center rounded-full bg-white px-4 text-base font-semibold text-blue-800 ring-1 ring-blue-200">
            Call
          </a>
        )}
        {hasDetails && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Details"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-amber-800 hover:bg-amber-100">
            <ChevronDown className={`h-5 w-5 transition ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {notice && (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <Clock className="h-4 w-4 shrink-0" /> {notice.text}
        </p>
      )}

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
            className="min-h-12 flex-1 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
            {pending ? 'Booking…' : 'Confirm'}
          </button>
        )}
        <Link href={otherTimeHref}
          className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-white px-4 py-2.5 text-center text-sm font-semibold text-gray-900 ring-1 ring-gray-300">
          Other time
        </Link>
        {notice?.stale && (
          <button type="button" onClick={decline} disabled={pending}
            className="min-h-12 flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-200 disabled:opacity-60">
            Decline
          </button>
        )}
      </div>
    </div>
  )
}
