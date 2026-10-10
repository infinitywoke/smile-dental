import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, Camera, CalendarClock, MessageCircle, UserPlus } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getTodayVisits } from '@/lib/data/visits'
import { getAppointmentsOn, getPendingRequests } from '@/lib/data/appointments'
import { formatDate, todayInIndia } from '@/lib/dates'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { SearchBox, ScreenLoading, TestBadge } from '@/components/clinic/ui'

async function TodayPageContent() {
  // The session check comes first: it makes this screen request-time before the date is read
  const doctor = await getDoctor()
  const [visits, requests, appointments] = await Promise.all([
    getTodayVisits(),
    getPendingRequests(),
    getAppointmentsOn(todayInIndia()),
  ])

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-gray-500">{formatDate(todayInIndia(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Today · {doctor.name}</h1>
      </div>

      {requests.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">
            {requests.length} booking request{requests.length === 1 ? '' : 's'}
          </h2>
          {requests.map((request) => {
            const wanted = request.requested_start ? inIndia(request.requested_start) : null
            return (
              <Link key={request.id} href={`/app/requests/${request.id}`}
                className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-300 hover:ring-amber-500">
                <MessageCircle className="h-5 w-5 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-base font-semibold text-gray-900">
                    <span className="truncate">{request.name}</span>
                    {request.is_test && <TestBadge />}
                    {request.medical_alerts && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Has medical alert" />}
                  </p>
                  <p className="text-sm text-amber-900">
                    {wanted ? `${formatDay(wanted.date)}, ${formatBlock(wanted.time)}` : 'No time chosen'}
                    {request.reason ? ` · ${request.reason}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold text-amber-900">Review</span>
              </Link>
            )
          })}
        </section>
      )}

      <Link href="/app/patients/new"
        className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-lg font-semibold text-white shadow-sm hover:bg-blue-700">
        <UserPlus className="h-6 w-6" /> New patient
      </Link>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-700">Returning patient?</p>
        <SearchBox />
      </div>

      {appointments.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">
            {appointments.length} appointment{appointments.length === 1 ? '' : 's'} today
          </h2>
          {appointments.map((appointment) => (
            <Link key={appointment.id} href={`/app/appointments/${appointment.id}`}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-blue-400">
              <CalendarClock className="h-5 w-5 shrink-0 text-blue-600" />
              <span className="w-20 shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                {formatBlock(inIndia(appointment.starts_at).time)}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-base font-semibold text-gray-900">{appointment.patient.name}</span>
                {appointment.patient.is_test && <TestBadge />}
                {appointment.patient.medical_alerts && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Has medical alert" />}
              </span>
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900">
          {visits.length === 0 ? 'No visits yet today' : `${visits.length} visit${visits.length === 1 ? '' : 's'} today`}
        </h2>
        {visits.map((visit) => (
          <Link key={visit.id} href={`/app/visits/${visit.id}`} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-blue-400">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-gray-900">{visit.patient.name}</span>
              {visit.patient.is_test && <TestBadge />}
              {visit.patient.medical_alerts && <AlertTriangle className="h-4 w-4 text-red-600" aria-label="Has medical alert" />}
              <span className="ml-auto text-xs text-gray-500">
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
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function TodayPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <TodayPageContent />
    </Suspense>
  )
}
