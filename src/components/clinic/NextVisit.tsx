'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CalendarClock, CalendarPlus, MessageCircle } from 'lucide-react'
import { bookNextVisit, removeNextVisit, suggestNextVisit } from '@/lib/actions/visits'
import { firstName } from '@/lib/whatsapp'
import { useUndo } from './UndoBar'
import { openWhatsApp } from '@/lib/whatsapp-business'
import { todayInIndia } from '@/lib/dates'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'
import type { Save } from './BillTools'
import { FullScreen, useBackToClose } from './FullScreen'
import { NextVisitPicker } from './NextVisitPicker'
import { LengthChips } from './LengthChips'

const when = (iso: string) => {
  const { date, time } = inIndia(iso)
  return `${formatDay(date)}, ${formatBlock(time)}`
}

// Next visit: "None" unless the doctor books one. One tap books the suggested time;
// "Pick another time" opens the day's free times. An appointment already coming up is shown instead,
// with "Change" when it was booked from this visit.
export function NextVisit({
  visitId,
  patientName,
  upcoming,
  upcomingMinutes = 40,
  bookedHere,
  save,
}: {
  visitId: string
  patientName: string
  // The patient's next appointment (an ISO moment), if one is booked
  upcoming: string | null
  // Its length, in minutes
  upcomingMinutes?: number
  // That appointment was booked from this visit, so choosing again moves it
  bookedHere: boolean
  save: Save
}) {
  const [suggestion, setSuggestion] = useState<string | null>(null)
  // How long the next visit will be (40 minutes unless chosen; a booked one keeps its own)
  const [minutes, setMinutes] = useState(upcomingMinutes)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null)
  const picker = useBackToClose()
  const offerUndo = useUndo()
  // After removing a next visit the patient already heard about: their cancellation message
  const [cancelUrl, setCancelUrl] = useState<string | null>(null)

  // The suggestion is only worked out when there is a choice to show
  useEffect(() => {
    if (upcoming) return
    let cancelled = false
    suggestNextVisit(visitId, minutes)
      .then((instant) => !cancelled && setSuggestion(instant))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [visitId, upcoming, minutes])

  // Books (or moves) the next visit. From the picker, it closes first (through its history entry).
  // Once the visit's WhatsApp has gone, the patient has the old time (or none), so WhatsApp opens
  // with the new time, as Move does; the big button below is the fallback.
  async function book(instant: string, fromPicker = false) {
    if (pending) return
    setError(null)
    setPending(true)
    try {
      const result = await save(() => bookNextVisit(visitId, instant, minutes))
      if (result.error) {
        setError(result.error)
        return
      }
      const url = result.whatsappUrl ?? null
      setWhatsappUrl(url)
      setCancelUrl(null)
      // A new booking can be taken back at once (a change is undone by changing again)
      if (!upcoming) offerUndo(`Next visit booked: ${when(instant)}`, () => save(() => removeNextVisit(visitId)))
      if (fromPicker) {
        // WhatsApp opens once Back has closed the picker, so the two never cross
        if (url) window.addEventListener('popstate', () => openWhatsApp(url), { once: true })
        picker.close()
      } else if (url) {
        openWhatsApp(url)
      }
    } catch {
      setError("Couldn't reach the server. Check the internet and try again.")
    } finally {
      setPending(false)
    }
  }

  // Booked by mistake: it goes at once, with Undo (which books the same time again)
  async function remove() {
    if (pending || !upcoming) return
    const was = upcoming
    setError(null)
    setPending(true)
    try {
      const result = await save(() => removeNextVisit(visitId))
      if (result.error) {
        setError(result.error)
        return
      }
      setWhatsappUrl(null)
      setCancelUrl(result.whatsappUrl ?? null)
      const wasMinutes = upcomingMinutes
      offerUndo('Next visit removed', () => save(() => bookNextVisit(visitId, was, wasMinutes)))
    } catch {
      setError("Couldn't reach the server. Check the internet and try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="hud-heading">Next visit</h2>
      {upcoming ? (
        <>
          <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-blue-50 py-1 pl-4 pr-1 ring-1 ring-blue-200">
            <CalendarClock className="h-5 w-5 shrink-0 text-blue-600" />
            <p className="min-w-0 flex-1 text-base font-semibold text-blue-900">Booked: {when(upcoming)}</p>
            {bookedHere && (
              <>
                <button type="button" onClick={() => void remove()} disabled={pending}
                  className="min-h-12 shrink-0 rounded-xl px-3 text-base font-semibold text-red-700 disabled:opacity-60">
                  Remove
                </button>
                <button type="button" onClick={picker.show} disabled={pending}
                  className="min-h-12 shrink-0 rounded-xl bg-white px-4 text-base font-semibold text-blue-800 ring-1 ring-blue-200 disabled:opacity-60">
                  Change
                </button>
              </>
            )}
          </div>
          {whatsappUrl && (
            <a href={whatsappUrl}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-lg font-semibold text-white shadow-sm hover:bg-blue-700">
              <MessageCircle className="h-6 w-6" /> Open WhatsApp
            </a>
          )}
        </>
      ) : (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <p className="text-base text-gray-700">None</p>
          <LengthChips value={minutes} onChange={(m) => { setMinutes(m); setSuggestion(null) }} />
          {cancelUrl && (
            <a href={cancelUrl}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-base font-semibold text-gray-900 ring-1 ring-gray-300">
              <MessageCircle className="h-5 w-5" /> Tell {firstName(patientName)} it&apos;s cancelled
            </a>
          )}
          {error && !picker.open && (
            <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          {suggestion && (
            <button type="button" onClick={() => void book(suggestion)} disabled={pending}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 text-base font-semibold text-blue-800 ring-1 ring-blue-200 disabled:opacity-60">
              <CalendarPlus className="h-5 w-5" /> {pending ? 'Booking…' : `Book ${when(suggestion)}`}
            </button>
          )}
          <button type="button" onClick={picker.show} disabled={pending}
            className="flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-base font-semibold text-gray-700 ring-1 ring-gray-300 disabled:opacity-60">
            Pick another time
          </button>
        </div>
      )}

      {picker.open && (
        <FullScreen title="Next visit" onClose={picker.close}>
          <div className="space-y-3 p-4">
            {error && (
              <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}
            {pending && <p className="text-sm text-gray-500">Booking…</p>}
            <NextVisitPicker
              startDate={upcoming ? inIndia(upcoming).date : suggestion ? inIndia(suggestion).date : todayInIndia()}
              minDate={todayInIndia()}
              patientName={patientName}
              minutes={minutes}
              onPick={(instant) => void book(instant, true)}
            />
          </div>
        </FullScreen>
      )}
    </section>
  )
}
