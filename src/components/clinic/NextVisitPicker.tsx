'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getScheduleForDate } from '@/lib/actions/appointments'
import type { DaySchedule } from '@/lib/data/appointments'
import { addDays, formatDay } from '@/lib/schedule'
import { SlotGrid } from './SlotGrid'

// Day arrows and the day's free times: pick one and it is handed back
export function NextVisitPicker({
  startDate,
  minDate,
  patientName,
  onPick,
  onCancel,
}: {
  startDate: string
  minDate: string
  patientName: string
  onPick: (instant: string) => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(startDate)
  const [schedule, setSchedule] = useState<DaySchedule | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    getScheduleForDate(date)
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
  }, [date])

  const loading = !failed && schedule?.date !== date
  const free = schedule && schedule.date === date ? schedule.blocks.filter((b) => b.state === 'free') : []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setDate(addDays(date, -1))} disabled={date <= minDate} aria-label="Previous day"
          className="rounded-full p-2 text-blue-700 hover:bg-blue-50 disabled:opacity-30">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-sm font-bold text-gray-900">{formatDay(date)}</p>
        <button type="button" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"
          className="rounded-full p-2 text-blue-700 hover:bg-blue-50">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {failed && <p className="text-sm text-red-700">Could not load times. Check the connection and try again.</p>}
      {loading && <p className="text-sm text-gray-500">Checking availability…</p>}
      {schedule && !loading && (
        schedule.closed ? (
          <p className="rounded-xl bg-gray-100 p-3 text-center text-sm text-gray-600">The clinic is closed on Fridays.</p>
        ) : free.length === 0 ? (
          <p className="rounded-xl bg-gray-100 p-3 text-center text-sm text-gray-600">Nothing free this day.</p>
        ) : (
          <SlotGrid blocks={free} label={patientName} onPick={onPick} />
        )
      )}

      <button type="button" onClick={onCancel} className="w-full rounded-full py-2 text-sm font-semibold text-gray-500 hover:text-gray-900">
        Cancel
      </button>
    </div>
  )
}
