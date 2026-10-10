import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, Camera, UserPlus } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getTodayVisits } from '@/lib/data/visits'
import { formatDate, todayInIndia } from '@/lib/dates'
import { SearchBox, ScreenLoading } from '@/components/clinic/ui'

async function TodayPageContent() {
  const [doctor, visits] = await Promise.all([getDoctor(), getTodayVisits()])

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-gray-500">{formatDate(todayInIndia(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Today · {doctor.name}</h1>
      </div>

      <Link href="/app/patients/new"
        className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-lg font-semibold text-white shadow-sm hover:bg-blue-700">
        <UserPlus className="h-6 w-6" /> New patient
      </Link>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-700">Returning patient?</p>
        <SearchBox />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900">
          {visits.length === 0 ? 'No visits yet today' : `${visits.length} visit${visits.length === 1 ? '' : 's'} today`}
        </h2>
        {visits.map((visit) => (
          <Link key={visit.id} href={`/app/visits/${visit.id}`} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-blue-400">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-gray-900">{visit.patient.name}</span>
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
