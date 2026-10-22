'use client'

import { useEffect, useState } from 'react'
import { getScheduleForDate } from '@/lib/actions/appointments'
import type { DaySchedule } from '@/lib/data/appointments'
import { DEFAULT_LENGTH, addDays, formatDay, isClosedDay } from '@/lib/schedule'
import { MonthCalendar } from './MonthCalendar'
import { SlotGrid } from './SlotGrid'
import { WhenPicker } from './WhenPicker'

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
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    getScheduleForDate(date, minutes)
      .then((result) => {
        if (!cancelled) {
          setSchedule(result)
          setFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [date, minutes])

  const loading = !failed && (schedule?.date !== date || schedule?.length !== minutes)
  const free = schedule && schedule.date === date && schedule.length === minutes ? schedule.blocks.filter((b) => b.state === 'free') : []

  return (
    <WhenPicker
      length={minutes}
      onLength={onMinutes}
      dayPicker={<MonthCalendar selected={date} minDate={minDate} maxDate={addDays(minDate, 365)} isClosed={isClosedDay} onSelect={setDate} />}
    >
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
