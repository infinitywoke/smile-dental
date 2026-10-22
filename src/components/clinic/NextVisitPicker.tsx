'use client'

import { useEffect, useState } from 'react'
import { getScheduleForDate } from '@/lib/actions/appointments'
import type { DayBlock, DaySchedule } from '@/lib/data/appointments'
import { isNetworkError } from '@/lib/offline/outbox'
import { DEFAULT_LENGTH, addDays, blockInstant, formatDay, isClosedDay, startsFor } from '@/lib/schedule'
import { MonthCalendar } from './MonthCalendar'
import { SlotGrid } from './SlotGrid'
import { WhenPicker } from './WhenPicker'

// With no signal: every time of the day the clinic offers for this length, not yet over (other
// bookings can't be seen, so the server checks the time once the signal is back)
function clinicTimes(date: string, minutes: number): DayBlock[] {
  const now = Date.now()
  return startsFor(date, minutes)
    .map((time) => ({ time, instant: blockInstant(date, time), state: 'free' as const }))
    .filter((block) => new Date(block.instant).getTime() > now)
}

// How long, the day from a month calendar (up to a year ahead), and that day's free times: the time
// picked is handed back
export function NextVisitPicker({
  startDate,
  minDate,
  patientName,
  minutes = DEFAULT_LENGTH,
  onMinutes,
  onPick,
}: {
  startDate: string
  minDate: string
  patientName: string
  // How long the visit is: only times where it fits are offered
  minutes?: number
  onMinutes: (minutes: number) => void
  onPick: (instant: string) => void
}) {
  const [date, setDate] = useState(startDate)
  const [schedule, setSchedule] = useState<DaySchedule | null>(null)
  // 'offline': no signal, so the clinic's own times are offered instead
  const [failed, setFailed] = useState<'offline' | 'error' | null>(null)

  useEffect(() => {
    let cancelled = false
    getScheduleForDate(date, minutes)
      .then((result) => {
        if (!cancelled) {
          setSchedule(result)
          setFailed(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setFailed(isNetworkError(e) ? 'offline' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [date, minutes])

  const loading = !failed && (schedule?.date !== date || schedule?.length !== minutes)
  const free = schedule && schedule.date === date && schedule.length === minutes ? schedule.blocks.filter((b) => b.state === 'free') : []
  const calendar = <MonthCalendar selected={date} minDate={minDate} maxDate={addDays(minDate, 365)} isClosed={isClosedDay} onSelect={setDate} />

  if (failed === 'offline') {
    const times = clinicTimes(date, minutes)
    return (
      <WhenPicker length={minutes} onLength={onMinutes} dayPicker={calendar}>
        <p className="text-base font-bold text-gray-900">Clinic times on {formatDay(date)}</p>
        <p role="note" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          No signal, so other bookings can&apos;t be seen. The time you pick is booked when the signal is back, if it&apos;s still free.
        </p>
        {times.length === 0 ? (
          <p className="rounded-xl bg-gray-100 p-3 text-center text-sm text-gray-600">{isClosedDay(date) ? 'The clinic is closed on Fridays.' : 'No times left this day.'}</p>
        ) : (
          <SlotGrid blocks={times} label={patientName} onPick={onPick} />
        )}
      </WhenPicker>
    )
  }

  return (
    <WhenPicker length={minutes} onLength={onMinutes} dayPicker={calendar}>
      <p className="text-base font-bold text-gray-900">Free times on {formatDay(date)}</p>
      {failed && <p className="text-sm text-red-700">Could not load times. Check the connection and try again.</p>}
      {loading && <p className="text-sm text-gray-500">Checking availability…</p>}
      {schedule && !loading && (
        schedule.closed ? (
          <p className="rounded-xl bg-gray-100 p-3 text-center text-sm text-gray-600">The clinic is closed on Fridays.</p>
        ) : schedule.dayOff ? (
          <p className="rounded-xl bg-gray-100 p-3 text-center text-sm text-gray-600">This day is closed in your calendar.</p>
        ) : free.length === 0 ? (
          <p className="rounded-xl bg-gray-100 p-3 text-center text-sm text-gray-600">Nothing free this day.</p>
        ) : (
          <SlotGrid blocks={free} label={patientName} onPick={onPick} />
        )
      )}
    </WhenPicker>
  )
}
