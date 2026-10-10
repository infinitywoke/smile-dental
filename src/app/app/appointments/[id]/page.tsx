import { Suspense } from 'react'
import Link from 'next/link'
import { CalendarClock, Phone, Plus } from 'lucide-react'
import { getAppointment, getDaySchedule } from '@/lib/data/appointments'
import { todayInIndia } from '@/lib/dates'
import { formatPhone } from '@/lib/phone'
import { blockEnd, formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { BackLink, Card, MedicalAlert, ScreenLoading, TestBadge } from '@/components/clinic/ui'
import { SlotScheduler } from '@/components/clinic/SlotScheduler'
import { CancelAppointmentButton } from '@/components/clinic/CalendarActions'

const DATE = /^\d{4}-\d{2}-\d{2}$/

async function AppointmentPageContent({ params, searchParams }: PageProps<'/app/appointments/[id]'>) {
  const { id } = await params
  const { move, d } = await searchParams
  const appointment = await getAppointment(id)
  const { date, time } = inIndia(appointment.starts_at)
  const patient = appointment.patient
  const moving = move === '1' && appointment.status === 'booked'

  if (moving) {
    const wanted = typeof d === 'string' && DATE.test(d) ? d : date >= todayInIndia() ? date : todayInIndia()
    const schedule = await getDaySchedule(wanted)
    return (
      <div className="space-y-4">
        <BackLink href={`/app/appointments/${id}`} label="Appointment" />
        <h1 className="text-xl font-bold text-gray-900">Move {patient.name}</h1>
        <SlotScheduler
          mode="move"
          id={appointment.id}
          label={patient.name}
          date={schedule.date}
          blocks={schedule.blocks}
          closed={schedule.closed}
          dayOff={schedule.dayOff}
          originalInstant={appointment.starts_at}
          basePath={`/app/appointments/${appointment.id}`}
          query="move=1"
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <BackLink href={`/app?d=${date}`} label="Today" />

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
          <span className="truncate">{patient.name}</span>
          {patient.is_test && <TestBadge />}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <CalendarClock className="h-4 w-4" />
          {formatDay(date)}, {formatBlock(time)} – {formatBlock(blockEnd(time))}
        </p>
        {patient.phone && <p className="mt-0.5 text-sm text-gray-500">{formatPhone(patient.phone)}</p>}
      </div>

      <MedicalAlert alerts={patient.medical_alerts} />
      {appointment.reason && <Card className="text-sm text-gray-700"><span className="text-gray-500">Reason:</span> {appointment.reason}</Card>}

      {appointment.status !== 'booked' ? (
        <p className="rounded-xl bg-gray-100 p-3 text-center text-sm font-medium text-gray-600">This appointment is {appointment.status.replace('_', ' ')}.</p>
      ) : (
        <>
          <div className="flex gap-3">
            <Link href={`/app/patients/${patient.id}/visits/new?appointmentId=${appointment.id}`}
              className="flex flex-[2] items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700">
              <Plus className="h-5 w-5" /> Start visit
            </Link>
            {patient.phone && (
              <a href={`tel:+91${patient.phone}`} aria-label="Call patient"
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-base font-semibold text-gray-900 ring-1 ring-gray-300">
                <Phone className="h-5 w-5" /> Call
              </a>
            )}
          </div>
          <div className="flex gap-3">
            <Link href={`/app/appointments/${appointment.id}?move=1`}
              className="flex flex-1 items-center justify-center rounded-full bg-white px-4 py-3 text-sm font-semibold text-gray-900 ring-1 ring-gray-300">
              Move
            </Link>
            <Link href={`/app/patients/${patient.id}`}
              className="flex flex-1 items-center justify-center rounded-full bg-white px-4 py-3 text-sm font-semibold text-gray-900 ring-1 ring-gray-300">
              Open patient
            </Link>
          </div>
          <CancelAppointmentButton appointmentId={appointment.id} backTo={`/app?d=${date}`} />
        </>
      )}
    </div>
  )
}

export default function AppointmentPage(props: PageProps<'/app/appointments/[id]'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <AppointmentPageContent {...props} />
    </Suspense>
  )
}
