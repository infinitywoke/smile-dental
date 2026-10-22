'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { holidayKind, holidayName, holidaysBetween } from '@/lib/holidays'
import { addDays, weekday } from '@/lib/schedule'
import { HolidayDot } from './HolidayNote'

// "2026-10" + 1 -> "2026-11"
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const longDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const shortDay = (date: string) =>
  `${Number(date.slice(8))} ${new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })}`
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// A month to pick a day from: arrows for the month before and after, and the list of months to jump
// further (a check-up six months on). Days before minDate, after maxDate, or closed (Fridays, days he
// blocked off) are greyed out. Holidays and festivals carry a gold dot, and the month's are listed
// under it with the days he blocked off (src/lib/holidays.ts).
export function MonthCalendar({
  selected,
  minDate,
  maxDate,
  isClosed,
  daysOff = [],
  onSelect,
}: {
  selected: string
  minDate: string
  maxDate: string
  isClosed: (date: string) => boolean
  // Days the clinic is blocked off whole (from Today's "Block the day")
  daysOff?: string[]
  onSelect: (date: string) => void
}) {
  const [month, setMonth] = useState(selected.slice(0, 7))
  const first = minDate.slice(0, 7)
  const last = maxDate.slice(0, 7)
  const months: string[] = []
  for (let m = first; m <= last; m = addMonths(m, 1)) months.push(m)

  // Monday first: blanks before the 1st, then each day of the month
  const start = `${month}-01`
  const blanks = (weekday(start) + 6) % 7
  const days: string[] = []
  for (let d = start; d.startsWith(month); d = addDays(d, 1)) days.push(d)
  const off = new Set(daysOff)

  // This month's holidays, festivals and closed days from today on, in date order
  const listed = [...new Set([...holidaysBetween(start, days[days.length - 1]).map((h) => h.date), ...daysOff.filter((d) => d.startsWith(month))])]
    .filter((d) => d >= minDate && d <= maxDate)
    .sort()

  const arrow = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50 disabled:opacity-30'
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setMonth(addMonths(month, -1))} disabled={month <= first} aria-label="Previous month" className={arrow}>
          <ChevronLeft className="h-6 w-6" />
        </button>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month"
          className="min-h-12 min-w-0 flex-1 rounded-xl border-0 bg-transparent px-2 text-center text-base font-bold text-gray-900 ring-1 ring-inset ring-gray-200">
          {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        </select>
        <button type="button" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= last} aria-label="Next month" className={arrow}>
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-gray-500" aria-hidden="true">
        {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Days of ${monthName(month)}`}>
        {Array.from({ length: blanks }, (_, i) => <span key={`blank-${i}`} />)}
        {days.map((date) => {
          const closed = date < minDate || date > maxDate || isClosed(date) || off.has(date)
          const chosen = date === selected
          const kind = holidayKind(date)
          const label = [longDay(date), holidayName(date), off.has(date) && 'clinic closed'].filter(Boolean).join(': ')
          return (
            <button key={date} type="button" onClick={() => onSelect(date)} disabled={closed} aria-pressed={chosen} aria-label={label}
              className={`relative flex h-11 items-center justify-center rounded-full text-base font-semibold tabular-nums transition-colors disabled:text-gray-300 ${
                chosen ? 'bg-blue-600 text-white' : date === minDate ? 'text-gray-900 ring-1 ring-inset ring-gray-300' : 'text-gray-900 hover:bg-gray-100'
              }`}>
              {Number(date.slice(8))}
              {kind && <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2"><HolidayDot kind={kind} /></span>}
            </button>
          )
        })}
      </div>
      {listed.length > 0 && (
        <ul aria-label={`Holidays in ${monthName(month)}`} className="space-y-1.5 rounded-xl bg-gray-50 p-3">
          {listed.map((date) => {
            const kind = holidayKind(date)
            return (
              <li key={date} className="flex items-center gap-2 text-sm">
                <span className="hud-mono w-14 shrink-0 font-semibold text-gray-900">{shortDay(date)}</span>
                <span className="min-w-0 flex-1 text-gray-700">{[holidayName(date), off.has(date) && 'Clinic closed'].filter(Boolean).join(' · ')}</span>
                {kind && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-gray-500">
                    <HolidayDot kind={kind} />{kind === 'holiday' ? 'Holiday' : 'Festival'}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
