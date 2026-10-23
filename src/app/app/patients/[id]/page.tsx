import { Suspense } from 'react'
import Link from 'next/link'
import { Cake, Camera, CalendarClock, ChevronDown, ChevronRight, MessageCircle, Pencil, Phone } from 'lucide-react'
import { getPatientHub } from '@/lib/data/patient-hub'
import { formatDate } from '@/lib/dates'
import { isBirthday, patientAge } from '@/lib/patient-fields'
import { formatPhone } from '@/lib/phone'
import { formatRupees } from '@/lib/pricing'
import { endOf, formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { whatsappLink } from '@/lib/whatsapp'
import { BackLink, MedicalAlert, ScreenLoading } from '@/components/clinic/ui'
import { VisitStatusBadge } from '@/components/clinic/VisitStatusBadge'
import { StartVisitButton } from '@/components/clinic/StartVisitButton'
import { CancelAppointmentButton } from '@/components/clinic/CalendarActions'
import { genderLabel } from '@/lib/gender'

// The patient page is the hub: Start visit first, then what is coming up, then history.
async function PatientPageContent({ params }: PageProps<'/app/patients/[id]'>) {
  const { id } = await params
  const { patient, visits, coming, balance, todayVisitId, appointmentTodayId, due } = await getPatientHub(id)
  const age = patientAge(patient)
  const startClass = 'flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-lg font-extrabold text-white shadow-sm hover:bg-blue-700 disabled:opacity-70'

  return (
    <div className="space-y-5">
      <BackLink href="/app/patients" label="Patients" />

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-[26px] font-extrabold tracking-tight text-gray-900">
            <span className="truncate">{patient.name}</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {[age !== null && `${age} yrs`, genderLabel(patient.gender), formatPhone(patient.phone)].filter(Boolean).join(' · ')}
          </p>
          {patient.birth_date && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
              {isBirthday(patient.birth_date) && <Cake className="h-4 w-4 text-[var(--hud-gold)]" aria-hidden="true" />}
              {isBirthday(patient.birth_date) ? <span className="font-semibold text-gray-900">Birthday today</span> : 'Born'} {formatDate(patient.birth_date)}
            </p>
          )}
        </div>
        {patient.phone && (
          <div className="flex shrink-0 gap-2">
            <a href={`tel:+91${patient.phone}`} aria-label="Call patient"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-800 ring-1 ring-gray-300">
              <Phone className="h-5 w-5" />
            </a>
            <a href={whatsappLink(patient.phone, '')} aria-label="WhatsApp patient"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-800 ring-1 ring-gray-300">
              <MessageCircle className="h-5 w-5" />
            </a>
          </div>
        )}
      </div>

      <MedicalAlert alerts={patient.medical_alerts} />

      {/* Start visit first, always */}
      <div className="space-y-2">
        {todayVisitId ? (
          <Link href={`/app/visits/${todayVisitId}`} className={startClass}>Open today’s visit</Link>
        ) : (
          <StartVisitButton patientId={patient.id} appointmentId={appointmentTodayId ?? undefined} className={startClass} />
        )}
        {/* One money rule (src/lib/billing.ts): Collect when something is owed, Advance when paid ahead, never both */}
        {due ? (
          <Link href={`/app/visits/${due.visitId}?step=bill`}
            className="flex min-h-14 w-full items-center justify-center gap-1.5 rounded-2xl bg-white px-5 py-4 text-lg font-bold text-gray-900 shadow-sm ring-2 ring-[var(--hud-amber)] ring-inset">
            Collect <span className="hud-mono text-[var(--hud-amber-text)]">{formatRupees(due.amount)}</span>
          </Link>
        ) : balance < 0 ? (
          <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-800 ring-1 ring-green-200">
            Advance with us: {formatRupees(-balance)}
          </p>
        ) : null}
        <Link href={`/app/book?patient=${patient.id}`}
          className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-white px-5 text-base font-semibold text-blue-700 ring-1 ring-gray-300">
          Book appointment
        </Link>
      </div>

      {/* Coming up */}
      {coming.length > 0 && (
        <section className="space-y-2">
          <h2 className="hud-heading">Coming up</h2>
          {coming.map((appointment) => {
            const { date, time } = inIndia(appointment.starts_at)
            return (
              <div key={appointment.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
                <div className="flex items-center gap-3">
                  <CalendarClock className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="hud-mono text-[15px] font-bold text-gray-900">{formatDay(date)}, {formatBlock(time)} – {formatBlock(endOf(time, appointment.duration_min))}</p>
                    {appointment.reason && <p className="truncate text-sm text-gray-500">{appointment.reason}</p>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link href={`/app/appointments/${appointment.id}/move`}
                    className="flex min-h-12 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-blue-700 ring-1 ring-blue-200">
                    Move
                  </Link>
                  <CancelAppointmentButton appointmentId={appointment.id} backTo={`/app/patients/${patient.id}`} />
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* Visits */}
      <section className="space-y-3">
        <h2 className="hud-heading">Visits ({visits.length})</h2>
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
                <p className="hud-mono mt-0.5 text-xs font-medium text-gray-600">
                  {formatRupees(visit.total)} billed{visit.status.due > 0 ? ` · ${formatRupees(visit.status.due)} due` : ''}
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
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-semibold text-gray-900">
          Details
          <ChevronDown className="h-5 w-5 text-gray-400 transition group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-gray-700"><span className="text-gray-500">Address:</span> {patient.address || '—'}</p>
          <p className="text-gray-700"><span className="text-gray-500">Heard from:</span> {patient.heard_from || '—'}</p>
          <p className="text-gray-700">
            <span className="text-gray-500">First visit:</span> {visits.length > 0 ? formatDate(visits[visits.length - 1].visit_date) : '—'}
          </p>
          <Link href={`/app/patients/${patient.id}/edit`} className="inline-flex min-h-12 items-center gap-1 text-base font-semibold text-blue-600">
            <Pencil className="h-4 w-4" /> Edit details
          </Link>
        </div>
      </details>

      {/* Rare and serious: out of the way, and it asks for the password */}
      <Link href={`/app/patients/${patient.id}/delete`} className="flex min-h-12 items-center justify-center text-sm font-semibold text-red-600">
        Delete patient
      </Link>
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
