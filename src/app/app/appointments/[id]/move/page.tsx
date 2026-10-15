import { Suspense } from 'react'
import { lengthLabel } from '@/lib/schedule'
import { redirect } from 'next/navigation'
import { getAppointment, getDaySchedule } from '@/lib/data/appointments'
import { todayInIndia } from '@/lib/dates'
import { inIndia } from '@/lib/schedule'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { SlotScheduler } from '@/components/clinic/SlotScheduler'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// Moving an appointment: the day's times, tap another time
async function MovePageContent({ params, searchParams }: PageProps<'/app/appointments/[id]/move'>) {
  const { id } = await params
  const { d } = await searchParams
  const appointment = await getAppointment(id)
  if (appointment.status !== 'booked') redirect(`/app/patients/${appointment.patient_id}`)

  const { date } = inIndia(appointment.starts_at)
  const today = todayInIndia()
  const wanted = typeof d === 'string' && DATE.test(d) ? d : date >= today ? date : today
  // It keeps its own length
  const schedule = await getDaySchedule(wanted, appointment.duration_min)

  return (
    <div className="space-y-4">
      <BackLink href={`/app/patients/${appointment.patient_id}`} label={appointment.patient.name} />
      <h1 className="text-xl font-bold text-gray-900">Move {appointment.patient.name}</h1>
      <p className="text-sm text-gray-600">{lengthLabel(appointment.duration_min)} appointment</p>
      <SlotScheduler
        mode="move"
        id={appointment.id}
        label={appointment.patient.name}
        date={schedule.date}
        blocks={schedule.blocks}
        closed={schedule.closed}
        dayOff={schedule.dayOff}
        originalInstant={appointment.starts_at}
        basePath={`/app/appointments/${appointment.id}/move`}
      />
    </div>
  )
}

export default function MovePage(props: PageProps<'/app/appointments/[id]/move'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <MovePageContent {...props} />
    </Suspense>
  )
}
