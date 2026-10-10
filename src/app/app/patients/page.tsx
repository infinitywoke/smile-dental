import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { searchPatients } from '@/lib/data/patients'
import { ageOn } from '@/lib/dates'
import { formatPhone } from '@/lib/phone'
import { SearchBox, ScreenLoading, TestBadge } from '@/components/clinic/ui'

async function PatientsPageContent({ searchParams }: PageProps<'/app/patients'>) {
  const { q } = await searchParams
  const query = typeof q === 'string' ? q : ''
  const patients = await searchPatients(query)

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Patients</h1>
      <SearchBox key={query} defaultValue={query} />

      <p className="text-sm font-medium text-gray-500">
        {query ? `${patients.length} result${patients.length === 1 ? '' : 's'} for “${query}”` : 'Newest patients'}
      </p>

      {patients.length === 0 && (
        <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-gray-200">
          <p className="text-gray-600">{query ? 'No patients found.' : 'No patients yet.'}</p>
          <Link href="/app/patients/new" className="mt-3 inline-block font-semibold text-blue-600">Add a new patient</Link>
        </div>
      )}

      <ul className="space-y-2">
        {patients.map((patient) => (
          <li key={patient.id}>
            <Link href={`/app/patients/${patient.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-blue-400">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold text-gray-900">
                  <span className="truncate">{patient.name}</span>
                  {patient.is_test && <TestBadge />}
                  {patient.medical_alerts && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Has medical alert" />}
                </p>
                <p className="text-sm text-gray-500">
                  {[formatPhone(patient.phone), patient.date_of_birth && `${ageOn(patient.date_of_birth)} yrs`].filter(Boolean).join(' · ') || 'No phone'}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>
          </li>
        ))}
      </ul>

    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function PatientsPage(props: PageProps<'/app/patients'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <PatientsPageContent {...props} />
    </Suspense>
  )
}
