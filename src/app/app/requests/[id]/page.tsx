import { Suspense } from 'react'
import Link from 'next/link'
import { MessageCircle, Phone } from 'lucide-react'
import { findAppointment, getBookingRequest, getDaySchedule } from '@/lib/data/appointments'
import { findPatientsByPhone, likelyPatient } from '@/lib/data/patients'
import { confirmationMessage, whatsappLink } from '@/lib/whatsapp'
import { todayInIndia } from '@/lib/dates'
import { patientAge } from '@/lib/patient-fields'
import { formatPhone } from '@/lib/phone'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { BackLink, Card, MedicalAlert, ScreenLoading } from '@/components/clinic/ui'
import { SlotScheduler } from '@/components/clinic/SlotScheduler'
import { LengthChips } from '@/components/clinic/LengthChips'
import { DEFAULT_LENGTH, lengthFrom } from '@/lib/schedule'
import { genderLabel } from '@/lib/gender'

const DATE = /^\d{4}-\d{2}-\d{2}$/

async function RequestPageContent({ params, searchParams }: PageProps<'/app/requests/[id]'>) {
  const { id } = await params
  const { d, len } = await searchParams
  const request = await getBookingRequest(id)
  const today = todayInIndia()

  if (request.status !== 'new') {
    // Booked: the confirmation can be sent again, for the appointment's time as it is now
    const appointment = request.status === 'booked' ? await findAppointment(request.appointment_id) : null
    const booked = appointment?.status === 'booked' ? inIndia(appointment.starts_at) : null
    return (
      <div className="space-y-4">
        <BackLink href="/app" label="Today" />
        <Card className="space-y-3">
          <h1 className="text-xl font-bold text-gray-900">{request.name}</h1>
          <p className="text-sm text-gray-600">
            {booked
              ? `Booked for ${formatDay(booked.date)}, ${formatBlock(booked.time)}.`
              : `This request was ${request.status === 'booked' ? 'booked' : request.status === 'declined' ? 'declined' : 'handled'} already.`}
          </p>
          {booked && appointment && (
            <a href={whatsappLink(request.phone, confirmationMessage({ name: request.name, startsAt: appointment.starts_at }))}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-base font-semibold text-white">
              <MessageCircle className="h-5 w-5" /> Send confirmation again
            </a>
          )}
          {request.patient_id && (
            <Link href={`/app/patients/${request.patient_id}`} className="inline-flex min-h-12 items-center text-base font-semibold text-blue-700">Open patient</Link>
          )}
        </Card>
      </div>
    )
  }

  const requested = request.requested_start ? inIndia(request.requested_start) : null
  const wanted = typeof d === 'string' && DATE.test(d) ? d : requested && requested.date >= today ? requested.date : today
  const minutes = lengthFrom(len)
  const [schedule, matches] = await Promise.all([getDaySchedule(wanted, minutes), findPatientsByPhone(request.phone)])

  const address = request.address ?? ''
  const age = patientAge(request)

  return (
    <div className="space-y-5">
      <BackLink href="/app" label="Today" />

      <Card className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-gray-900">{request.name}</h1>
            <p className="text-sm text-gray-500">
              {[age !== null && `${age} yrs`, genderLabel(request.gender), formatPhone(request.phone)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <a href={`tel:+91${request.phone}`} aria-label="Call patient"
            className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300">
            <Phone className="h-4 w-4" /> Call
          </a>
        </div>
        <MedicalAlert alerts={request.medical_alerts} />
        <p className="text-sm text-gray-700"><span className="text-gray-500">Address:</span> {address || '—'}</p>
        <p className="text-sm text-gray-700"><span className="text-gray-500">Heard from:</span> {request.heard_from || '—'}</p>
        <p className="text-sm text-gray-700"><span className="text-gray-500">Reason:</span> {request.reason || '—'}</p>
        {request.notes && <p className="text-sm text-gray-700"><span className="text-gray-500">Note:</span> {request.notes}</p>}
        {request.voice_url && (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-800">🎤 Voice note</p>
            <audio src={request.voice_url} controls preload="none" className="w-full" aria-label="Voice note" />
          </div>
        )}
        {!request.voice_url && request.voice_variant === 'whatsapp' && (
          <p className="text-sm text-gray-700">🎤 Asked to send a voice note on WhatsApp</p>
        )}
        {requested && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            Asked for {formatDay(requested.date)}, {formatBlock(requested.time)}
          </p>
        )}
      </Card>

      <LengthChips value={minutes} href={(m) => `/app/requests/${request.id}?d=${wanted}${m === DEFAULT_LENGTH ? '' : `&len=${m}`}`} />

      <SlotScheduler
        mode="request"
        minutes={minutes}
        query={minutes === DEFAULT_LENGTH ? undefined : `len=${minutes}`}
        id={request.id}
        label={request.name}
        date={schedule.date}
        blocks={schedule.blocks}
        closed={schedule.closed}
        dayOff={schedule.dayOff}
        originalInstant={request.requested_start}
        basePath={`/app/requests/${request.id}`}
        matches={matches.map((m) => ({ id: m.id, name: m.name, age: patientAge(m) }))}
        likelyMatch={likelyPatient(request.name, matches)?.id ?? null}
      />
    </div>
  )
}

export default function RequestPage(props: PageProps<'/app/requests/[id]'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <RequestPageContent {...props} />
    </Suspense>
  )
}
