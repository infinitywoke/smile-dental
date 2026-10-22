'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertCircle, CalendarCheck, MessageCircle, UserCheck } from 'lucide-react'
import { confirmBookingRequest, declineBookingRequest, moveAppointment } from '@/lib/actions/appointments'
import { DEFAULT_LENGTH, addDays, formatDay, formatWhen, inIndia, sameInstant } from '@/lib/schedule'
import type { DayBlock } from '@/lib/data/appointments'
import { SlotGrid, isPlaceable } from './SlotGrid'
import { WhenPicker } from './WhenPicker'
import { openWhatsApp } from '@/lib/whatsapp-business'

type Props = {
  mode: 'request' | 'move'
  // The booking request, or the appointment being moved
  id: string
  // The patient's name
  label: string
  date: string
  blocks: DayBlock[]
  closed: boolean
  dayOff: boolean
  // Where the patient asked to be (request mode) or already is (move mode)
  originalInstant: string | null
  // Page this screen lives on, for the day arrows and the length (?d=, ?len=)
  basePath: string
  // Patients in the app who share the request's phone number
  matches?: { id: string; name: string; age: number | null }[]
  // The one of them this request most likely is (same name, or the only one): chosen to start with
  likelyMatch?: string | null
  // How long the appointment will be, and the length the page has without ?len= (30 minutes for a
  // request, its own length for an appointment being moved)
  minutes?: number
  defaultMinutes?: number
}

type Done = { whatsappUrl?: string; patientId?: string; when: string }

// Shows a day's blocks. The doctor taps a free block and saves.
export function SlotScheduler({ mode, id, label, date, blocks, closed, dayOff, originalInstant, basePath, matches = [], likelyMatch = null, minutes = DEFAULT_LENGTH, defaultMinutes = DEFAULT_LENGTH }: Props) {
  const [selected, setSelected] = useState<string | null>(() => {
    if (!originalInstant) return null
    const own = blocks.find((b) => sameInstant(b.instant, originalInstant))
    return own && isPlaceable(own, id) ? own.instant : null
  })
  // A patient id, null for a new patient, or undefined until the doctor says who it is (when the
  // number is known but it can't be told whose it is)
  const [linkPatient, setLinkPatient] = useState<string | null | undefined>(likelyMatch ?? (matches.length > 0 ? undefined : null))
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [pending, startTransition] = useTransition()
  const withLength = (m: number) => (m === defaultMinutes ? '' : `&len=${m}`)
  const dayHref = (d: string) => `${basePath}?d=${d}${withLength(minutes)}`
  const mustChoose = mode === 'request' && linkPatient === undefined
  // The time to save is one of this day's free times for this length (not one picked on another day)
  const shown = selected !== null && blocks.some((b) => sameInstant(b.instant, selected) && isPlaceable(b, id))

  function save() {
    if (!selected || !shown || linkPatient === undefined) return
    setError(null)
    startTransition(async () => {
      const result =
        mode === 'request'
          ? await confirmBookingRequest(id, selected, linkPatient, minutes)
          : await moveAppointment(id, selected, minutes)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.declined) {
        // Declined already (another tab): nothing was booked. The decline message stays one tap away,
        // but doesn't open by itself, since the doctor tapped Save, not Decline.
        setDone({ whatsappUrl: result.whatsappUrl, when: 'Declined' })
        return
      }
      // A retry may find the request booked already, at the time it was booked then
      setDone({ whatsappUrl: result.whatsappUrl, patientId: result.patientId, when: formatWhen(result.startsAt ?? selected) })
      // Open the patient's chat with the message ready; the big "Open WhatsApp" button below is the fallback
      if (result.whatsappUrl) openWhatsApp(result.whatsappUrl)
    })
  }

  function decline() {
    if (!window.confirm(`Decline ${label}'s request? You can send them a message to call the clinic.`)) return
    setError(null)
    startTransition(async () => {
      const result = await declineBookingRequest(id)
      if (result.error) {
        setError(result.error)
        return
      }
      setDone({ whatsappUrl: result.whatsappUrl, when: 'Declined' })
      if (result.whatsappUrl) openWhatsApp(result.whatsappUrl)
    })
  }

  if (done) {
    return (
      <div className="space-y-4 rounded-2xl bg-green-50 p-5 text-center ring-1 ring-green-200">
        <CalendarCheck className="mx-auto h-10 w-10 text-green-600" />
        <h2 className="text-xl font-bold text-gray-900">{done.when === 'Declined' ? 'Request declined' : 'Booked'}</h2>
        {done.when !== 'Declined' && (
          <p className="text-gray-700">{label} · {done.when}</p>
        )}
        {done.whatsappUrl && (
          <a href={done.whatsappUrl}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-lg font-semibold text-white">
            <MessageCircle className="h-6 w-6" />
            Open WhatsApp
          </a>
        )}
        <div className="flex justify-center gap-4 text-sm font-semibold text-blue-700">
          {done.patientId && <Link href={`/app/patients/${done.patientId}`} className="flex min-h-12 items-center px-2">Open patient</Link>}
          <Link href="/app" className="flex min-h-12 items-center px-2">Back to Today</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <WhenPicker
        length={minutes}
        lengthLink={{ path: `${basePath}?d=${date}`, defaultLength: defaultMinutes }}
        day={formatDay(date)}
        date={date}
        note={originalInstant && inIndia(originalInstant).date === date ? (mode === 'request' ? 'Day requested' : 'Current day') : null}
        prev={{ href: dayHref(addDays(date, -1)) }}
        next={{ href: dayHref(addDays(date, 1)) }}
      >

      {/* Existing patients with this number */}
      {mode === 'request' && matches.length > 0 && (
        <div className="space-y-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <p className="text-sm font-semibold text-amber-900">
            This number belongs to {matches.length === 1 ? matches[0].name : `${matches.length} patients`}.
          </p>
          <p className="text-sm text-amber-900">{mustChoose ? 'Tap who this is before you save.' : 'Who is this?'}</p>
          {matches.map((m) => (
            <label key={m.id} className="flex min-h-12 items-center gap-3 rounded-lg bg-white px-3 py-2 text-base ring-1 ring-amber-200">
              <input type="radio" className="h-5 w-5 shrink-0" name="link" checked={linkPatient === m.id} onChange={() => setLinkPatient(m.id)} />
              <UserCheck className="h-4 w-4 text-amber-700" />
              <span className="font-medium text-gray-900">{m.name}</span>
              {m.age !== null && <span className="text-gray-500">· {m.age} yrs</span>}
            </label>
          ))}
          <label className="flex min-h-12 items-center gap-3 rounded-lg bg-white px-3 py-2 text-base ring-1 ring-amber-200">
            <input type="radio" className="h-5 w-5 shrink-0" name="link" checked={linkPatient === null} onChange={() => setLinkPatient(null)} />
            <span className="font-medium text-gray-900">New patient: {label}</span>
          </label>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {closed ? (
        <p className="rounded-xl bg-gray-100 p-4 text-center text-sm font-medium text-gray-600">The clinic is closed on Fridays. Try another day.</p>
      ) : (
        <div className="space-y-4">
          {dayOff && <p className="rounded-xl bg-gray-100 p-3 text-center text-sm font-medium text-gray-600">This day is blocked off in your calendar.</p>}
          <SlotGrid blocks={blocks} selected={selected} label={label} onPick={setSelected} ownId={id} />
        </div>
      )}
      </WhenPicker>

      {/* Sits right on top of the bottom bar (64 px tall, plus the phone's gesture area), solid, so no times show through */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 space-y-2 border-t border-gray-200 bg-gray-50 px-4 pb-2 pt-2">
        <button type="button" onClick={save} disabled={!shown || pending || mustChoose || (mode === 'move' && sameInstant(selected, originalInstant) && minutes === defaultMinutes)}
          className="min-h-14 w-full rounded-full bg-blue-600 px-5 py-4 text-lg font-semibold text-white shadow-lg hover:bg-blue-700 disabled:opacity-50">
          {pending ? 'Saving…' : mode === 'request' ? 'Save and confirm' : 'Move appointment'}
        </button>
        {mode === 'request' && (
          <button type="button" onClick={decline} disabled={pending}
            className="min-h-12 w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
            Can’t fit this time: decline
          </button>
        )}
      </div>
    </div>
  )
}
