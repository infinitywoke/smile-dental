'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, CalendarClock, Check, MessageCircle } from 'lucide-react'
import type { VisitDetail } from '@/lib/data/types'
import type { VisitBill } from '@/lib/data/billing'
import { completeVisit, reopenVisit } from '@/lib/actions/visits'
import { visitMessage } from '@/lib/billing'
import { formatRupees } from '@/lib/pricing'
import { todayInIndia } from '@/lib/dates'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { NextVisitPicker } from './NextVisitPicker'

// Step 3: one message to the patient (bill, next visit, prescription link), then the visit is done.
export function VisitSendStep({
  visit,
  bill,
  suggestion,
  onBack,
}: {
  visit: VisitDetail
  bill: VisitBill
  // The proposed next visit (an ISO moment), or null when the patient has one already or the day is full
  suggestion: string | null
  onBack: () => void
}) {
  const router = useRouter()
  const upcoming = visit.next_appointment?.starts_at ?? null
  const [next, setNext] = useState<string | null>(upcoming ? null : suggestion)
  const [picking, setPicking] = useState(false)
  // Photos named "prescription" (or "rx") are ticked; the doctor can tick any other
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(visit.photos.filter((p) => /prescription|\brx\b/i.test(p.caption)).map((p) => p.id)),
  )
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [pending, startTransition] = useTransition()

  const nextShown = upcoming ?? next
  const hasPhone = !!visit.patient.phone

  // The link itself is only created at the moment of sending
  const preview = visitMessage({
    patientName: visit.patient.name,
    visitDate: visit.visit_date,
    lines: bill.charges,
    payments: bill.payments,
    summary: bill.summary,
    nextAppointment: nextShown ? { starts_at: nextShown } : null,
    prescriptionPhotoUrls: ticked.size > 0 ? ['(a secure 30-day link is added when you send)'] : [],
  })

  const toggle = (id: string) =>
    setTicked((current) => {
      const copy = new Set(current)
      if (copy.has(id)) copy.delete(id)
      else copy.add(id)
      return copy
    })

  function run(send: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await completeVisit(visit.id, { nextStartsAt: upcoming ? null : next, photoIds: [...ticked], send })
      if (result.error) {
        setError(result.error)
        return
      }
      setFinished(true)
      // The patient's chat opens with everything ready; the doctor taps Send
      if (result.whatsappUrl) window.location.assign(result.whatsappUrl)
    })
  }

  function reopen() {
    startTransition(async () => {
      await reopenVisit(visit.id)
      setFinished(false)
      router.refresh()
    })
  }

  const done = finished || !!visit.closed_at
  const { summary } = bill

  return (
    <div className="space-y-5 pb-12">
      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {done && (
        <div className="space-y-3 rounded-2xl bg-emerald-50 p-4 text-center ring-1 ring-emerald-200">
          <p className="flex items-center justify-center gap-2 font-semibold text-emerald-900"><Check className="h-5 w-5" /> Visit done</p>
          <div className="flex justify-center gap-3">
            <button type="button" onClick={() => router.push('/app')}
              className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Back to Today</button>
            <button type="button" onClick={reopen} disabled={pending}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-gray-300">Reopen</button>
          </div>
        </div>
      )}

      {/* Bill in one line */}
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Bill</p>
          <p className="text-lg font-bold text-gray-900">{formatRupees(summary.total)}</p>
        </div>
        <div className="text-right text-sm">
          <p className="text-gray-600">Paid <span className="font-semibold text-green-700">{formatRupees(summary.paid)}</span></p>
          {summary.balance > 0 && <p className="font-semibold text-red-700">Due {formatRupees(summary.balance)}</p>}
        </div>
      </div>

      {/* Next visit */}
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <p className="font-semibold text-gray-900">Next visit</p>
        {picking ? (
          <NextVisitPicker
            startDate={nextShown ? inIndia(nextShown).date : todayInIndia()}
            minDate={todayInIndia()}
            patientName={visit.patient.name}
            onPick={(instant) => {
              setNext(instant)
              setPicking(false)
            }}
            onCancel={() => setPicking(false)}
          />
        ) : nextShown ? (
          <div className="flex items-center gap-3 rounded-xl bg-blue-50 p-3 ring-1 ring-blue-200">
            <CalendarClock className="h-5 w-5 shrink-0 text-blue-600" />
            <p className="min-w-0 flex-1 text-sm font-semibold text-blue-900">
              {formatDay(inIndia(nextShown).date)}, {formatBlock(inIndia(nextShown).time)}
              {upcoming && <span className="block text-xs font-normal text-blue-700">Already booked</span>}
            </p>
            {!upcoming && (
              <>
                <button type="button" onClick={() => setPicking(true)} className="text-xs font-semibold text-blue-700">Change</button>
                <button type="button" onClick={() => setNext(null)} className="text-xs font-semibold text-gray-500">None</button>
              </>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setPicking(true)}
            className="w-full rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-semibold text-gray-700 hover:border-blue-400">
            + Book next visit
          </button>
        )}
      </div>

      {/* Prescription photos */}
      {visit.photos.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <p className="font-semibold text-gray-900">Send a photo link</p>
          {visit.photos.map((photo) => (
            <label key={photo.id} className="flex cursor-pointer items-center gap-3 rounded-xl p-2 ring-1 ring-gray-200">
              <input type="checkbox" checked={ticked.has(photo.id)} onChange={() => toggle(photo.id)}
                className="h-5 w-5 rounded border-gray-300 text-blue-600" />
              {photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link
                <img src={photo.url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-gray-200" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">Photo</span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{photo.caption || 'Photo'}</span>
            </label>
          ))}
        </div>
      )}

      {/* The message */}
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <p className="font-semibold text-gray-900">WhatsApp message</p>
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-800 ring-1 ring-gray-200">
          {preview}
        </pre>
        {hasPhone ? (
          <button type="button" onClick={() => run(true)} disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 py-4 text-lg font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-60">
            <MessageCircle className="h-6 w-6" /> {pending ? 'Preparing…' : 'Send on WhatsApp'}
          </button>
        ) : (
          <p className="rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-900 ring-1 ring-amber-200">
            Add the patient&apos;s WhatsApp number to send this message.
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onBack}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white px-4 py-3 text-sm font-semibold text-gray-700 ring-1 ring-gray-300">
          <ArrowLeft className="h-4 w-4" /> Bill
        </button>
        {!done && (
          <button type="button" onClick={() => run(false)} disabled={pending}
            className="flex flex-[2] items-center justify-center gap-2 rounded-full bg-gray-900 px-5 py-3.5 text-base font-semibold text-white disabled:opacity-60">
            <Check className="h-5 w-5" /> Finish without sending
          </button>
        )}
      </div>
    </div>
  )
}
