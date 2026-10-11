import { Suspense } from 'react'
import Link from 'next/link'
import { Camera, CalendarClock, ChevronDown, ChevronRight, MessageCircle, Pencil, Phone, Plus } from 'lucide-react'
import { getPatientHub } from '@/lib/data/patient-hub'
import { ageOn, formatDate } from '@/lib/dates'
import { formatPhone } from '@/lib/phone'
import { formatRupees } from '@/lib/pricing'
import { nextActionFor } from '@/lib/next-action'
import { blockEnd, formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { whatsappLink } from '@/lib/whatsapp'
import { BackLink, MedicalAlert, ScreenLoading, TestBadge } from '@/components/clinic/ui'
import { VisitStatusBadge } from '@/components/clinic/VisitStatusBadge'
import { CancelAppointmentButton } from '@/components/clinic/CalendarActions'
import { genderLabel } from '@/lib/gender'

// The patient page is the hub: one smart button leads, then what is coming up, then history.
async function PatientPageContent({ params }: PageProps<'/app/patients/[id]'>) {
  const { id } = await params
  const { patient, visits, coming, balance, situation } = await getPatientHub(id)
  const action = nextActionFor(situation)
  const showNewVisitLink = action.label !== 'New visit' && action.label !== 'Continue visit' && action.label !== 'Start visit'

  const tone = {
    visit: 'bg-blue-600 hover:bg-blue-700',
    money: 'bg-red-600 hover:bg-red-700',
    calm: 'bg-blue-600 hover:bg-blue-700',
  }[action.tone]

  return (
    <div className="space-y-5">
      <BackLink href="/app/patients" label="Patients" />

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
            <span className="truncate">{patient.name}</span>
            {patient.is_test && <TestBadge />}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {[patient.date_of_birth && `${ageOn(patient.date_of_birth)} yrs`, genderLabel(patient.gender), formatPhone(patient.phone)].filter(Boolean).join(' · ')}
          </p>
        </div>
        {patient.phone && (
          <div className="flex shrink-0 gap-2">
            <a href={`tel:+91${patient.phone}`} aria-label="Call patient"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-800 ring-1 ring-gray-300">
              <Phone className="h-5 w-5" />
            </a>
            <a href={whatsappLink(patient.phone, '')} aria-label="WhatsApp patient"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-green-600 text-white">
              <MessageCircle className="h-5 w-5" />
            </a>
          </div>
        )}
      </div>

      <MedicalAlert alerts={patient.medical_alerts} />

      {balance !== 0 && action.tone !== 'money' && (
        <p className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${balance > 0 ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-green-50 text-green-800 ring-green-200'}`}>
          {balance > 0 ? `Balance due: ${formatRupees(balance)}` : `Advance with us: ${formatRupees(-balance)}`}
        </p>
      )}

      {/* The one button */}
      <div className="space-y-2">
        <Link href={action.href}
          className={`flex items-center justify-center gap-2 rounded-2xl px-5 py-4 text-lg font-semibold text-white shadow-sm ${tone}`}>
          {action.label}
        </Link>
        {showNewVisitLink && (
          <Link href={`/app/patients/${patient.id}/visits/new`}
            className="flex items-center justify-center gap-1.5 text-sm font-semibold text-blue-700">
            <Plus className="h-4 w-4" /> New visit
          </Link>
        )}
      </div>

      {/* Coming up */}
      {coming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">Coming up</h2>
          {coming.map((appointment) => {
            const { date, time } = inIndia(appointment.starts_at)
            return (
              <div key={appointment.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
                <div className="flex items-center gap-3">
                  <CalendarClock className="h-5 w-5 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{formatDay(date)}, {formatBlock(time)} – {formatBlock(blockEnd(time))}</p>
                    {appointment.reason && <p className="truncate text-sm text-gray-500">{appointment.reason}</p>}
                  </div>
                  <Link href={`/app/appointments/${appointment.id}/move`}
                    className="rounded-full px-3 py-1.5 text-sm font-semibold text-blue-700 ring-1 ring-blue-200">
                    Move
                  </Link>
                </div>
                <div className="mt-2">
                  <CancelAppointmentButton appointmentId={appointment.id} backTo={`/app/patients/${patient.id}`} />
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* Visits */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900">Visits ({visits.length})</h2>
        {visits.length === 0 && <p className="text-sm text-gray-500">No visits yet.</p>}
        {visits.map((visit) => (
          <Link key={visit.id} href={`/app/visits/${visit.id}`}
            className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-blue-400">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">
                {formatDate(visit.visit_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                <VisitStatusBadge status={visit.status} />
              </p>
              {visit.total > 0 && (
                <p className="mt-0.5 text-xs font-medium text-gray-600">
                  {formatRupees(visit.total)} billed{visit.balance > 0 ? ` · ${formatRupees(visit.balance)} due` : ''}
                </p>
              )}
              {visit.notes && <p className="mt-1 line-clamp-2 text-sm text-gray-600">{visit.notes}</p>}
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

      {/* Details, out of the way */}
      <details className="group rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-gray-900">
          Details
          <ChevronDown className="h-5 w-5 text-gray-400 transition group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-gray-700"><span className="text-gray-500">Born:</span> {patient.date_of_birth ? formatDate(patient.date_of_birth) : '—'}</p>
          <p className="text-gray-700"><span className="text-gray-500">Address:</span> {patient.address || '—'}</p>
          <p className="text-gray-700"><span className="text-gray-500">Heard from:</span> {patient.heard_from || '—'}</p>
          <p className="text-gray-700">
            <span className="text-gray-500">First visit:</span> {visits.length > 0 ? formatDate(visits[visits.length - 1].visit_date) : '—'}
          </p>
          <Link href={`/app/patients/${patient.id}/edit`} className="inline-flex items-center gap-1 pt-1 font-semibold text-blue-600">
            <Pencil className="h-4 w-4" /> Edit details
          </Link>
        </div>
      </details>
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
