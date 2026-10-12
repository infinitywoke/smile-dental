import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, Camera, ChevronLeft, ChevronRight } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getVisitsOn } from '@/lib/data/visits'
import { getDues, type Due } from '@/lib/data/dues'
import { getAppointmentsOn, getBusyCounts, getDaySchedule, getPendingRequests } from '@/lib/data/appointments'
import { formatDate, todayInIndia } from '@/lib/dates'
import { patientAge } from '@/lib/patient-fields'
import { addDays, formatBlock, formatDay, inIndia, weekday } from '@/lib/schedule'
import { formatRupees } from '@/lib/pricing'
import { ScreenLoading } from '@/components/clinic/ui'
import { RequestCard } from '@/components/clinic/RequestCard'
import { SlotGrid } from '@/components/clinic/SlotGrid'
import { DayOffButton } from '@/components/clinic/CalendarActions'
import { VisitStatusBadge } from '@/components/clinic/VisitStatusBadge'
import { StartVisitButton } from '@/components/clinic/StartVisitButton'
import { genderLabel } from '@/lib/gender'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const STRIP_DAYS = 14

// Today is the day sheet: who needs a decision, who is coming and has been seen (one list), and what is free.
async function TodayContent({ searchParams }: PageProps<'/app'>) {
  // The session check comes first: it makes this screen request-time before the date is read
  await getDoctor()
  const { d } = await searchParams
  const today = todayInIndia()
  const date = typeof d === 'string' && DATE.test(d) ? d : today
  const isToday = date === today

  const [schedule, appointments, visits, requests, busy, dues] = await Promise.all([
    getDaySchedule(date),
    getAppointmentsOn(date),
    getVisitsOn(date),
    getPendingRequests(),
    getBusyCounts(today, STRIP_DAYS),
    isToday ? getDues() : Promise.resolve([] as Due[]),
  ])

  const strip = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i))
  const poolBlocks = schedule.blocks.filter((b) => b.state === 'free' || b.state === 'blocked' || b.state === 'request')

  // Money owed is a today thing: other days show only who is coming. A due whose visit is already
  // a row below shows its badge there, so it isn't listed twice.
  const listed = new Set(visits.map((v) => v.id))
  const showDues = dues.filter((due) => !listed.has(due.visitId))

  // One list in time order. A booked patient who already has a visit that day shows once, as the visit.
  const seen = new Set(visits.map((v) => v.patient.id))
  const rows = [
    ...appointments
      .filter((a) => !seen.has(a.patient_id))
      .map((appointment) => ({ kind: 'booked' as const, at: new Date(appointment.starts_at).getTime(), appointment })),
    ...visits.map((visit) => ({ kind: 'seen' as const, at: new Date(visit.created_at).getTime(), visit })),
  ].sort((x, y) => x.at - y.at)

  return (
    <div className="space-y-6">
      {/* Day header and strip */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Link href={`/app?d=${addDays(date, -1)}`} className="-ml-3 flex h-12 w-12 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50" aria-label="Previous day">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{isToday ? 'Today' : formatDay(date)}</h1>
            {isToday && <p className="text-sm font-medium text-gray-500">{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
          </div>
          <Link href={`/app?d=${addDays(date, 1)}`} className="-mr-3 flex h-12 w-12 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50" aria-label="Next day">
            <ChevronRight className="h-6 w-6" />
          </Link>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {strip.map((day) => {
            const active = day === date
            const closed = weekday(day) === 5
            return (
              <Link key={day} href={day === today ? '/app' : `/app?d=${day}`}
                className={`flex min-h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl px-1 py-2 text-xs ring-1 ring-inset ${
                  active ? 'bg-blue-600 text-white ring-blue-600' : closed ? 'bg-gray-100 text-gray-400 ring-gray-200' : 'bg-white text-gray-700 ring-gray-300'
                }`}>
                <span className="font-semibold">{day === today ? 'Today' : formatDay(day).split(',')[0]}</span>
                <span className="text-base font-bold">{Number(day.slice(8))}</span>
                <span className={active ? 'text-blue-100' : 'text-gray-400'}>{closed ? 'off' : busy[day] ? `${busy[day]} booked` : '–'}</span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Needs you */}
      {(requests.length > 0 || showDues.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">Needs you</h2>
          {requests.map((request) => {
            const wanted = request.requested_start ? inIndia(request.requested_start) : null
            const age = patientAge(request)
            return (
              <RequestCard
                key={request.id}
                id={request.id}
                name={request.name}
                whenLabel={wanted ? `${formatDay(wanted.date)}, ${formatBlock(wanted.time)}` : null}
                reason={request.reason}
                alerts={request.medical_alerts}
                canConfirm={request.confirmable}
                otherTimeHref={`/app/requests/${request.id}${wanted ? `?d=${wanted.date >= today ? wanted.date : today}` : ''}`}
                details={{
                  age: [age !== null && `${age} yrs`, genderLabel(request.gender)].filter(Boolean).join(' · ') || null,
                  address: request.address || null,
                  heardFrom: request.heard_from,
                  notes: request.notes,
                }}
              />
            )
          })}
          {showDues.map((due) => (
            <Link key={due.patientId} href={`/app/visits/${due.visitId}?step=bill`}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-red-200 hover:ring-red-400">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-gray-900">{due.patientName}</span>
                <span className="block text-sm font-semibold text-red-700">{formatRupees(due.amount)} due</span>
              </span>
              <span className="flex min-h-12 items-center rounded-full bg-red-600 px-5 text-base font-semibold text-white">Collect</span>
            </Link>
          ))}
        </section>
      )}

      {/* Everyone on this day, in time order: booked, in the chair, finished */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-gray-900">
          {rows.length === 0
            ? `No patients ${isToday ? 'today' : 'this day'}`
            : `${rows.length} patient${rows.length === 1 ? '' : 's'}${isToday ? ' today' : ''}`}
        </h2>
        {rows.map((row) =>
          row.kind === 'booked' ? (
            <div key={`a-${row.appointment.id}`} className="flex items-center gap-2 rounded-2xl bg-white py-2 pr-2 pl-4 shadow-sm ring-1 ring-gray-200">
              <Link href={`/app/patients/${row.appointment.patient_id}`} className="flex min-h-12 min-w-0 flex-1 items-center gap-3">
                <span className="w-[4.5rem] shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                  {formatBlock(inIndia(row.appointment.starts_at).time)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-base font-semibold text-gray-900">{row.appointment.patient.name}</span>
                    {row.appointment.patient.medical_alerts && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Has medical alert" />}
                  </span>
                  {row.appointment.reason && <span className="block truncate text-sm text-gray-500">{row.appointment.reason}</span>}
                </span>
              </Link>
              {isToday && (
                <div className="shrink-0">
                  <StartVisitButton patientId={row.appointment.patient_id} appointmentId={row.appointment.id} label="Start"
                    className="flex min-h-12 min-w-20 items-center justify-center rounded-full bg-blue-600 px-5 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-70" />
                </div>
              )}
            </div>
          ) : (
            <Link key={`v-${row.visit.id}`} href={`/app/visits/${row.visit.id}`} className="block min-h-14 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-blue-400">
              {/* The whole name on its own line; the time and the badges under it */}
              <p className="flex items-start gap-2">
                <span className="min-w-0 text-base font-semibold break-words text-gray-900">{row.visit.patient.name}</span>
                {row.visit.patient.medical_alerts && <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-red-600" aria-label="Has medical alert" />}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {new Date(row.visit.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                </span>
                <VisitStatusBadge status={row.visit.status} />
              </p>
              {row.visit.notes && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{row.visit.notes}</p>}
              {row.visit.photo_count > 0 && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500">
                  <Camera className="h-3.5 w-3.5" /> {row.visit.photo_count} photo{row.visit.photo_count === 1 ? '' : 's'}
                </p>
              )}
            </Link>
          ),
        )}
      </section>

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
