import { Suspense } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getBusyCounts, getDaySchedule, type DayBlock } from '@/lib/data/appointments'
import { todayInIndia } from '@/lib/dates'
import { AFTERNOON_BLOCKS, MORNING_BLOCKS, addDays, blockEnd, formatBlock, formatDay, weekday } from '@/lib/schedule'
import { ScreenLoading, TestBadge } from '@/components/clinic/ui'
import { DayOffButton, UnblockButton } from '@/components/clinic/CalendarActions'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const STRIP_DAYS = 14

async function CalendarContent({ searchParams }: PageProps<'/app/calendar'>) {
  const { d } = await searchParams
  const today = todayInIndia()
  const date = typeof d === 'string' && DATE.test(d) ? d : today
  const [schedule, busy] = await Promise.all([getDaySchedule(date), getBusyCounts(today, STRIP_DAYS)])

  const booked = schedule.blocks.filter((b) => b.state === 'booked').length
  const requests = schedule.blocks.filter((b) => b.state === 'request').length
  const strip = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`/app/calendar?d=${addDays(date, -1)}`} className="rounded-full p-2 text-blue-700 hover:bg-blue-50" aria-label="Previous day">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">{formatDay(date)}</h1>
          <p className="text-xs text-gray-500">
            {schedule.closed ? 'Closed on Fridays' : `${booked} booked${requests ? ` · ${requests} request${requests === 1 ? '' : 's'}` : ''}`}
            {date !== today && <> · <Link href="/app/calendar" className="font-semibold text-blue-700">Today</Link></>}
          </p>
        </div>
        <Link href={`/app/calendar?d=${addDays(date, 1)}`} className="rounded-full p-2 text-blue-700 hover:bg-blue-50" aria-label="Next day">
          <ChevronRight className="h-6 w-6" />
        </Link>
      </div>

      {/* Next two weeks at a glance */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {strip.map((day) => {
          const active = day === date
          const closed = weekday(day) === 5
          return (
            <Link key={day} href={`/app/calendar?d=${day}`}
              className={`flex w-14 shrink-0 flex-col items-center rounded-xl px-1 py-2 text-xs ring-1 ring-inset ${
                active ? 'bg-blue-600 text-white ring-blue-600' : closed ? 'bg-gray-100 text-gray-400 ring-gray-200' : 'bg-white text-gray-700 ring-gray-300'
              }`}>
              <span className="font-semibold">{formatDay(day).split(',')[0]}</span>
              <span className="text-base font-bold">{Number(day.slice(8))}</span>
              <span className={active ? 'text-blue-100' : 'text-gray-400'}>{closed ? 'off' : busy[day] ? `${busy[day]} bkd` : '–'}</span>
            </Link>
          )
        })}
      </div>

      {!schedule.closed && (
        <div>
          <DayOffButton date={date} dayOff={schedule.dayOff} />
        </div>
      )}

      {schedule.closed ? (
        <p className="rounded-xl bg-gray-100 p-4 text-center text-sm font-medium text-gray-600">The clinic is closed on Fridays.</p>
      ) : (
        <div className="space-y-4">
          <Group title="Morning" times={MORNING_BLOCKS} blocks={schedule.blocks} date={date} />
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-gray-400">Break · 12:30 – 2:00 PM</p>
          <Group title="Afternoon and evening" times={AFTERNOON_BLOCKS} blocks={schedule.blocks} date={date} />
        </div>
      )}
    </div>
  )
}

function Group({ title, times, blocks, date }: { title: string; times: string[]; blocks: DayBlock[]; date: string }) {
  const rows = times.map((t) => blocks.find((b) => b.time === t)).filter((b): b is DayBlock => !!b)
  const row = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ring-1 ring-inset'
  return (
    <section className="space-y-1.5">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">{title}</h2>
      {rows.map((b) => {
        const label = <span className="w-24 shrink-0 font-semibold tabular-nums">{formatBlock(b.time)}</span>
        if (b.state === 'booked') {
          return (
            <Link key={b.instant} href={`/app/appointments/${b.appointmentId}`} className={`${row} bg-blue-50 text-gray-900 ring-blue-200`}>
              {label}
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate font-semibold">{b.patientName}</span>
                {b.isTest && <TestBadge />}
              </span>
              {b.reason && <span className="hidden max-w-[40%] truncate text-xs text-gray-500 sm:block">{b.reason}</span>}
            </Link>
          )
        }
        if (b.state === 'request') {
          return (
            <Link key={b.instant} href={`/app/requests/${b.requestId}`} className={`${row} bg-amber-50 text-amber-900 ring-amber-300`}>
              {label}
              <span className="min-w-0 flex-1 truncate">Request · <b>{b.requestName}</b></span>
              <span className="text-xs font-semibold">Review</span>
            </Link>
          )
        }
        if (b.state === 'blocked') {
          return (
            <div key={b.instant} className={`${row} bg-gray-100 text-gray-500 ring-gray-200`}>
              {label}
              <span className="min-w-0 flex-1 truncate">Blocked{b.note ? ` · ${b.note}` : ''}</span>
              <UnblockButton instant={b.instant} />
            </div>
          )
        }
        if (b.state === 'past') {
          return (
            <div key={b.instant} className={`${row} bg-white text-gray-300 ring-gray-100`}>
              {label}
              <span>—</span>
            </div>
          )
        }
        return (
          <Link key={b.instant} href={`/app/calendar/book?at=${encodeURIComponent(b.instant)}&d=${date}`}
            className={`${row} bg-white text-gray-900 ring-gray-300 hover:ring-blue-400`}>
            {label}
            <span className="text-gray-400">Free until {formatBlock(blockEnd(b.time))}</span>
          </Link>
        )
      })}
    </section>
  )
}

export default function CalendarPage(props: PageProps<'/app/calendar'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <CalendarContent {...props} />
    </Suspense>
  )
}
