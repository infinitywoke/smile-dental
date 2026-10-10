import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, Camera, CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getVisitsOn } from '@/lib/data/visits'
import { getAppointmentsOn, getBusyCounts, getDaySchedule, getPendingRequests } from '@/lib/data/appointments'
import { ageOn, formatDate, todayInIndia } from '@/lib/dates'
import { addDays, formatBlock, formatDay, inIndia, weekday } from '@/lib/schedule'
import { ScreenLoading, SearchBox, TestBadge } from '@/components/clinic/ui'
import { RequestCard } from '@/components/clinic/RequestCard'
import { SlotGrid } from '@/components/clinic/SlotGrid'
import { DayOffButton } from '@/components/clinic/CalendarActions'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const STRIP_DAYS = 14

// Today is the day sheet: who needs a decision, who is coming, who has been seen, and what is free.
async function TodayContent({ searchParams }: PageProps<'/app'>) {
  // The session check comes first: it makes this screen request-time before the date is read
  await getDoctor()
  const { d } = await searchParams
  const today = todayInIndia()
  const date = typeof d === 'string' && DATE.test(d) ? d : today
  const isToday = date === today

  const [schedule, appointments, visits, requests, busy] = await Promise.all([
    getDaySchedule(date),
    getAppointmentsOn(date),
    getVisitsOn(date),
    getPendingRequests(),
    getBusyCounts(today, STRIP_DAYS),
  ])

  const strip = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i))
  const poolBlocks = schedule.blocks.filter((b) => b.state === 'free' || b.state === 'blocked' || b.state === 'request')

  return (
    <div className="space-y-6">
      {/* Day header and strip */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Link href={`/app?d=${addDays(date, -1)}`} className="-ml-2 rounded-full p-2 text-blue-700 hover:bg-blue-50" aria-label="Previous day">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{isToday ? 'Today' : formatDay(date)}</h1>
            {!isToday && <Link href="/app" className="text-xs font-semibold text-blue-700">Back to today</Link>}
          </div>
          <Link href={`/app?d=${addDays(date, 1)}`} className="-mr-2 rounded-full p-2 text-blue-700 hover:bg-blue-50" aria-label="Next day">
            <ChevronRight className="h-6 w-6" />
          </Link>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {strip.map((day) => {
            const active = day === date
            const closed = weekday(day) === 5
            return (
              <Link key={day} href={day === today ? '/app' : `/app?d=${day}`}
                className={`flex w-14 shrink-0 flex-col items-center rounded-xl px-1 py-2 text-xs ring-1 ring-inset ${
                  active ? 'bg-blue-600 text-white ring-blue-600' : closed ? 'bg-gray-100 text-gray-400 ring-gray-200' : 'bg-white text-gray-700 ring-gray-300'
                }`}>
                <span className="font-semibold">{day === today ? 'Today' : formatDay(day).split(',')[0]}</span>
                <span className="text-base font-bold">{Number(day.slice(8))}</span>
                <span className={active ? 'text-blue-100' : 'text-gray-400'}>{closed ? 'off' : busy[day] ? `${busy[day]} bkd` : '–'}</span>
              </Link>
            )
          })}
        </div>
      </div>

      <SearchBox />

      {/* Needs you */}
      {requests.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">Needs you</h2>
          {requests.map((request) => {
            const wanted = request.requested_start ? inIndia(request.requested_start) : null
            return (
              <RequestCard
                key={request.id}
                id={request.id}
                name={request.name}
                isTest={request.is_test}
                whenLabel={wanted ? `${formatDay(wanted.date)}, ${formatBlock(wanted.time)}` : null}
                reason={request.reason}
                alerts={request.medical_alerts}
                canConfirm={request.confirmable}
                otherTimeHref={`/app/requests/${request.id}${wanted ? `?d=${wanted.date >= today ? wanted.date : today}` : ''}`}
                details={{
                  age: request.date_of_birth ? `${ageOn(request.date_of_birth)} yrs` : null,
                  address: request.address || [request.area, request.city].filter(Boolean).join(', ') || null,
                  heardFrom: request.heard_from,
                  notes: request.notes,
                }}
              />
            )
          })}
        </section>
      )}

      {/* Schedule */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-gray-900">
          {appointments.length === 0 ? `No appointments ${isToday ? 'today' : 'this day'}` : `${appointments.length} appointment${appointments.length === 1 ? '' : 's'}`}
        </h2>
        {appointments.map((appointment) => (
          <Link key={appointment.id} href={`/app/appointments/${appointment.id}`}
            className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-blue-400">
            <CalendarClock className="h-5 w-5 shrink-0 text-blue-600" />
            <span className="w-[4.5rem] shrink-0 text-sm font-semibold tabular-nums text-gray-900">
              {formatBlock(inIndia(appointment.starts_at).time)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-base font-semibold text-gray-900">{appointment.patient.name}</span>
                {appointment.patient.is_test && <TestBadge />}
                {appointment.patient.medical_alerts && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Has medical alert" />}
              </span>
              {appointment.reason && <span className="block truncate text-sm text-gray-500">{appointment.reason}</span>}
            </span>
          </Link>
        ))}
      </section>

      {/* Seen */}
      {visits.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">{visits.length} seen</h2>
          {visits.map((visit) => (
            <Link key={visit.id} href={`/app/visits/${visit.id}`} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-blue-400">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-semibold text-gray-900">{visit.patient.name}</span>
                {visit.patient.is_test && <TestBadge />}
                {visit.patient.medical_alerts && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Has medical alert" />}
                <span className="ml-auto shrink-0 text-xs text-gray-500">
                  {new Date(visit.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                </span>
              </div>
              {visit.notes && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{visit.notes}</p>}
              {visit.photo_count > 0 && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500">
                  <Camera className="h-3.5 w-3.5" /> {visit.photo_count} photo{visit.photo_count === 1 ? '' : 's'}
                </p>
              )}
            </Link>
          ))}
        </section>
      )}

      {/* Free times */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900">Free times</h2>
        {schedule.closed ? (
          <p className="rounded-xl bg-gray-100 p-4 text-center text-sm font-medium text-gray-600">The clinic is closed on Fridays.</p>
        ) : (
          <>
            {schedule.dayOff && <p className="rounded-xl bg-gray-100 p-3 text-center text-sm font-medium text-gray-600">This day is blocked off.</p>}
            {poolBlocks.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing free left{isToday ? ' today' : ''}.</p>
            ) : (
              <SlotGrid
                blocks={poolBlocks}
                hrefs={Object.fromEntries(
                  poolBlocks.map((b) => [
                    b.instant,
                    b.state === 'request' ? `/app/requests/${b.requestId}?d=${date}` : `/app/book?at=${encodeURIComponent(b.instant)}`,
                  ]),
                )}
              />
            )}
            <DayOffButton date={date} dayOff={schedule.dayOff} />
          </>
        )}
      </section>
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function TodayPage(props: PageProps<'/app'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <TodayContent {...props} />
    </Suspense>
  )
}
