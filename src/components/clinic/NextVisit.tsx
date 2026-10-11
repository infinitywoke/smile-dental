'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CalendarClock, CalendarPlus } from 'lucide-react'
import { bookNextVisit, suggestNextVisit } from '@/lib/actions/visits'
import { todayInIndia } from '@/lib/dates'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'
import type { Save } from './BillTools'
import { FullScreen, useBackToClose } from './FullScreen'
import { NextVisitPicker } from './NextVisitPicker'

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
  bookedHere,
  save,
}: {
  visitId: string
  patientName: string
  // The patient's next appointment (an ISO moment), if one is booked
  upcoming: string | null
  // That appointment was booked from this visit, so choosing again moves it
  bookedHere: boolean
  save: Save
}) {
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const picker = useBackToClose()

  // The suggestion is only worked out when there is a choice to show
  useEffect(() => {
    if (upcoming) return
    let cancelled = false
    suggestNextVisit(visitId)
      .then((instant) => !cancelled && setSuggestion(instant))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [visitId, upcoming])

  async function book(instant: string): Promise<boolean> {
    setError(null)
    setPending(true)
    try {
      const result = await save(() => bookNextVisit(visitId, instant))
      if (result.error) {
        setError(result.error)
        return false
      }
      return true
    } catch {
      setError("Couldn't reach the server. Check the internet and try again.")
      return false
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-gray-900">Next visit</h2>
      {upcoming ? (
        <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-blue-50 py-1 pl-4 pr-1 ring-1 ring-blue-200">
          <CalendarClock className="h-5 w-5 shrink-0 text-blue-600" />
          <p className="min-w-0 flex-1 text-base font-semibold text-blue-900">Booked: {when(upcoming)}</p>
          {bookedHere && (
            <button type="button" onClick={picker.show}
              className="min-h-12 shrink-0 rounded-xl bg-white px-4 text-base font-semibold text-blue-800 ring-1 ring-blue-200">
              Change
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <p className="text-base text-gray-700">None</p>
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
              onPick={async (instant) => {
                if (!pending && (await book(instant))) picker.close()
              }}
            />
          </div>
        </FullScreen>
      )}
    </section>
  )
}
