import { Suspense } from 'react'
import Link from 'next/link'
import { Camera, ChevronRight, Pencil, Phone, Plus } from 'lucide-react'
import { getPatient } from '@/lib/data/patients'
import { getPatientVisits } from '@/lib/data/visits'
import { getPatientBalance } from '@/lib/data/billing'
import { formatRupees } from '@/lib/pricing'
import { ageOn, formatDate } from '@/lib/dates'
import { formatPhone } from '@/lib/phone'
import { BackLink, Card, MedicalAlert, ScreenLoading, TestBadge } from '@/components/clinic/ui'

async function PatientPageContent({ params }: PageProps<'/app/patients/[id]'>) {
  const { id } = await params
  const [patient, visits, balance] = await Promise.all([getPatient(id), getPatientVisits(id), getPatientBalance(id)])

  return (
    <div className="space-y-5">
      <BackLink href="/app/patients" label="Patients" />

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">{patient.name}{patient.is_test && <TestBadge />}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {[patient.date_of_birth && `${ageOn(patient.date_of_birth)} yrs (born ${formatDate(patient.date_of_birth)})`, formatPhone(patient.phone)]
            .filter(Boolean).join(' · ')}
        </p>
      </div>

      <MedicalAlert alerts={patient.medical_alerts} />

      {balance !== 0 && (
        <p className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${balance > 0 ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-green-50 text-green-800 ring-green-200'}`}>
          {balance > 0 ? `Balance due: ${formatRupees(balance)}` : `Advance with us: ${formatRupees(-balance)}`}
        </p>
      )}

      <div className="flex gap-3">
        <Link href={`/app/patients/${patient.id}/visits/new`}
          className="flex flex-[2] items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700">
          <Plus className="h-5 w-5" /> New visit
        </Link>
        {patient.phone && (
          <a href={`tel:+91${patient.phone}`} aria-label="Call patient"
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-base font-semibold text-gray-900 ring-1 ring-gray-300">
            <Phone className="h-5 w-5" /> Call
          </a>
        )}
      </div>

      <Card className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-gray-900">Details</p>
          <Link href={`/app/patients/${patient.id}/edit`} className="inline-flex items-center gap-1 font-medium text-blue-600">
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        </div>
        <p className="text-gray-700"><span className="text-gray-500">Address:</span> {patient.address || '—'}</p>
        <p className="text-gray-700"><span className="text-gray-500">Heard from:</span> {patient.heard_from || '—'}</p>
        <p className="text-gray-700"><span className="text-gray-500">First visit:</span> {visits.length > 0 ? formatDate(visits[visits.length - 1].visit_date) : '—'}</p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900">Visits ({visits.length})</h2>
        {visits.length === 0 && <p className="text-sm text-gray-500">No visits yet.</p>}
        {visits.map((visit) => (
          <Link key={visit.id} href={`/app/visits/${visit.id}`} className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-blue-400">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">{formatDate(visit.visit_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
              {visit.notes && <p className="mt-1 line-clamp-3 text-sm text-gray-600">{visit.notes}</p>}
              {visit.photo_count > 0 && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500">
                  <Camera className="h-3.5 w-3.5" /> {visit.photo_count} photo{visit.photo_count === 1 ? '' : 's'}
                </p>
              )}
            </div>
            <ChevronRight className="mt-0.5 h-5 w-5 text-gray-400" />
          </Link>
        ))}
      </section>
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function PatientPage(props: PageProps<'/app/patients/[id]'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <PatientPageContent {...props} />
    </Suspense>
  )
}
