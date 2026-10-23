'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { getCalendarMonth, type CalendarMonth } from '@/lib/actions/appointments'
import { holidayKind, holidayName, holidaysBetween } from '@/lib/holidays'
import { addDays, weekday } from '@/lib/schedule'
import { HolidayDot } from './HolidayNote'

type View = 'days' | 'months' | 'years'

// "2026-10" + 1 -> "2026-11"
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const lastDayOf = (month: string) => addDays(`${addMonths(month, 1)}-01`, -1)
const format = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { ...options, timeZone: 'UTC' })
const monthName = (month: string) => format(`${month}-01`, { month: 'long', year: 'numeric' })
const longDay = (date: string) => format(date, { weekday: 'long', day: 'numeric', month: 'long' })
const shortDay = (date: string) => `${Number(date.slice(8))} ${format(date, { weekday: 'short' })}`
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const YEARS_SHOWN = 12

// A calendar to pick a day, in three views like a phone's: the days of a month (tap the month for the
// year's twelve months, tap the year for the years). Each day shows its holiday or festival (a gold
// dot, src/lib/holidays.ts), how many are booked, and whether the clinic is closed (Fridays, days
// blocked off); the month's holidays and closed days are listed under it. Days outside minDate–maxDate
// can't be picked, nor closed ones unless pickClosed (Today, which can show a closed day).
export function Calendar({
  selected,
  today,
  minDate,
  maxDate,
  isClosed,
  pickClosed = false,
  onSelect,
}: {
  selected: string
  today: string
  minDate?: string
  maxDate?: string
  // Closed every week (Fridays)
  isClosed?: (date: string) => boolean
  pickClosed?: boolean
  onSelect: (date: string) => void
}) {
  const [view, setView] = useState<View>('days')
  const [month, setMonth] = useState(selected.slice(0, 7))
  const [year, setYear] = useState(Number(selected.slice(0, 4)))
  const [firstYear, setFirstYear] = useState(Number(selected.slice(0, 4)) - 4)

  // How many are booked each day and the days blocked off, asked for once per month shown (with no
  // signal the calendar goes without)
  const [marks, setMarks] = useState<Record<string, CalendarMonth>>({})
  useEffect(() => {
    if (view !== 'days' || marks[month]) return
    let cancelled = false
    getCalendarMonth(month)
      .then((found) => {
        if (!cancelled) setMarks((all) => ({ ...all, [month]: found }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [view, month, marks])

  const inRange = (date: string) => (!minDate || date >= minDate) && (!maxDate || date <= maxDate)
  const monthInRange = (m: string) => (!minDate || m >= minDate.slice(0, 7)) && (!maxDate || m <= maxDate.slice(0, 7))
  const yearInRange = (y: number) => (!minDate || y >= Number(minDate.slice(0, 4))) && (!maxDate || y <= Number(maxDate.slice(0, 4)))

  const arrow = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50 disabled:opacity-30'
  const title = 'flex min-h-12 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-2 text-base font-bold text-gray-900 ring-1 ring-inset ring-gray-200 hover:bg-gray-50'
  const header = (label: string, onTitle: (() => void) | null, titleLabel: string, prev: () => void, prevOk: boolean, next: () => void, nextOk: boolean, unit: string) => (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={prev} disabled={!prevOk} aria-label={`Previous ${unit}`} className={arrow}>
        <ChevronLeft className="h-6 w-6" />
      </button>
      {onTitle ? (
        <button type="button" onClick={onTitle} aria-label={titleLabel} className={title}>
          {label} <ChevronDown className="h-4 w-4 text-gray-500" aria-hidden="true" />
        </button>
      ) : (
        <p className="flex min-h-12 flex-1 items-center justify-center text-base font-bold text-gray-900">{label}</p>
      )}
      <button type="button" onClick={next} disabled={!nextOk} aria-label={`Next ${unit}`} className={arrow}>
        <ChevronRight className="h-6 w-6" />
      </button>
    </div>
  )

  if (view === 'years') {
    const years = Array.from({ length: YEARS_SHOWN }, (_, i) => firstYear + i)
    return (
      <div className="space-y-3">
        {header(`${years[0]} – ${years[years.length - 1]}`, null, '',
          () => setFirstYear(firstYear - YEARS_SHOWN), yearInRange(firstYear - 1),
          () => setFirstYear(firstYear + YEARS_SHOWN), yearInRange(firstYear + YEARS_SHOWN), 'years')}
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Years">
          {years.map((y) => (
            <button key={y} type="button" disabled={!yearInRange(y)} aria-pressed={y === year}
              onClick={() => {
                setYear(y)
                setView('months')
              }}
              className={`hud-mono min-h-14 rounded-xl text-base font-bold ring-1 ring-inset disabled:text-gray-300 disabled:ring-gray-100 ${
                y === year ? 'bg-blue-600 text-white ring-blue-600' : y === Number(today.slice(0, 4)) ? 'text-gray-900 ring-gray-400' : 'text-gray-900 ring-gray-200 hover:bg-gray-50'
              }`}>
              {y}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (view === 'months') {
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
    return (
      <div className="space-y-3">
        {header(String(year), () => {
          setFirstYear(year - 4)
          setView('years')
        }, `${year}: choose another year`,
          () => setYear(year - 1), yearInRange(year - 1), () => setYear(year + 1), yearInRange(year + 1), 'year')}
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Months of ${year}`}>
          {months.map((m) => {
            const holidays = holidaysBetween(`${m}-01`, lastDayOf(m)).filter((h) => h.kind === 'holiday').length
            const name = format(`${m}-01`, { month: 'short' })
            return (
              <button key={m} type="button" disabled={!monthInRange(m)} aria-pressed={m === month}
                aria-label={`${format(`${m}-01`, { month: 'long' })} ${year}${holidays ? `: ${holidays} holiday${holidays === 1 ? '' : 's'}` : ''}`}
                onClick={() => {
                  setMonth(m)
                  setView('days')
                }}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-base font-bold ring-1 ring-inset disabled:text-gray-300 disabled:ring-gray-100 ${
                  m === month ? 'bg-blue-600 text-white ring-blue-600' : m === today.slice(0, 7) ? 'text-gray-900 ring-gray-400' : 'text-gray-900 ring-gray-200 hover:bg-gray-50'
                }`}>
                {name}
                {holidays > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold opacity-80"><HolidayDot kind="holiday" />{holidays}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Monday first: blanks before the 1st, then each day of the month
  const start = `${month}-01`
  const blanks = (weekday(start) + 6) % 7
  const days: string[] = []
  for (let d = start; d.startsWith(month); d = addDays(d, 1)) days.push(d)
  const shown = marks[month]
  const off = new Set(shown?.daysOff ?? [])
  const closedOn = (date: string) => (isClosed?.(date) ?? false) || off.has(date)

  // This month's holidays, festivals and days blocked off, in date order (from minDate on)
  const listed = [...new Set([...holidaysBetween(start, lastDayOf(month)).map((h) => h.date), ...off])]
    .filter((d) => !minDate || d >= minDate)
    .sort()

  return (
    <div className="space-y-2">
      {header(monthName(month), () => {
        setYear(Number(month.slice(0, 4)))
        setView('months')
      }, `${monthName(month)}: choose another month`,
        () => setMonth(addMonths(month, -1)), monthInRange(addMonths(month, -1)),
        () => setMonth(addMonths(month, 1)), monthInRange(addMonths(month, 1)), 'month')}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-gray-500" aria-hidden="true">
        {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Days of ${monthName(month)}`}>
        {Array.from({ length: blanks }, (_, i) => <span key={`blank-${i}`} />)}
        {days.map((date) => {
          const closed = closedOn(date)
          const chosen = date === selected
          const kind = holidayKind(date)
          const booked = shown?.booked[date] ?? 0
          const label = [longDay(date), holidayName(date), booked > 0 && `${booked} booked`, off.has(date) && 'clinic closed'].filter(Boolean).join(': ')
          return (
            <button key={date} type="button" onClick={() => onSelect(date)} disabled={!inRange(date) || (closed && !pickClosed)}
              aria-pressed={chosen} aria-label={label}
              className={`flex h-14 flex-col items-center justify-center rounded-xl tabular-nums transition-colors disabled:opacity-40 ${
                chosen ? 'bg-blue-600 text-white' : date === today ? 'ring-1 ring-inset ring-gray-400' : 'hover:bg-gray-100'
              } ${closed && !chosen ? 'text-gray-400' : chosen ? '' : 'text-gray-900'}`}>
              <span className="text-base font-semibold leading-tight">{Number(date.slice(8))}</span>
              <span className="flex h-4 items-center gap-1">
                {kind && <HolidayDot kind={kind} />}
                {booked > 0 && <span className={`hud-mono text-xs font-bold ${chosen ? 'text-blue-100' : 'text-gray-500'}`}>{booked}</span>}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between gap-2 pt-1 text-xs text-gray-500">
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1"><HolidayDot kind="holiday" />Holiday</span>
          <span className="flex items-center gap-1"><HolidayDot kind="festival" />Festival</span>
          <span><span className="hud-mono font-bold">2</span> = 2 booked</span>
        </span>
        {month !== today.slice(0, 7) && monthInRange(today.slice(0, 7)) && (
          <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-blue-700">
            Today
          </button>
        )}
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
