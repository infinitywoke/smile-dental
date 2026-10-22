'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, weekday } from '@/lib/schedule'

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
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// A month to pick a day from: arrows for the month before and after, and the list of months to jump
// further (a check-up six months on). Days before minDate, after maxDate, or closed are greyed out.
export function MonthCalendar({
  selected,
  minDate,
  maxDate,
  isClosed,
  onSelect,
}: {
  selected: string
  minDate: string
  maxDate: string
  isClosed: (date: string) => boolean
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
          const off = date < minDate || date > maxDate || isClosed(date)
          const chosen = date === selected
          return (
            <button key={date} type="button" onClick={() => onSelect(date)} disabled={off} aria-pressed={chosen} aria-label={longDay(date)}
              className={`flex h-11 items-center justify-center rounded-full text-base font-semibold tabular-nums transition-colors disabled:text-gray-300 ${
                chosen ? 'bg-blue-600 text-white' : date === minDate ? 'text-gray-900 ring-1 ring-inset ring-gray-300' : 'text-gray-900 hover:bg-gray-100'
              }`}>
              {Number(date.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
