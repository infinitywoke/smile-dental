import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAppointment, getDaySchedule } from '@/lib/data/appointments'
import { todayInIndia } from '@/lib/dates'
import { inIndia, isLength } from '@/lib/schedule'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { SlotScheduler } from '@/components/clinic/SlotScheduler'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// Moving an appointment: how long (its own length unless changed), the day, then another time
async function MovePageContent({ params, searchParams }: PageProps<'/app/appointments/[id]/move'>) {
  const { id } = await params
  const { d, len } = await searchParams
  const appointment = await getAppointment(id)
  if (appointment.status !== 'booked') redirect(`/app/patients/${appointment.patient_id}`)

  const { date } = inIndia(appointment.starts_at)
  const today = todayInIndia()
  const wanted = typeof d === 'string' && DATE.test(d) ? d : date >= today ? date : today
  const minutes = isLength(len) ? Number(len) : appointment.duration_min
  const schedule = await getDaySchedule(wanted, minutes)

  return (
    <div className="space-y-4">
      <BackLink href={`/app/patients/${appointment.patient_id}`} label={appointment.patient.name} />
      <h1 className="text-xl font-bold text-gray-900">Move {appointment.patient.name}</h1>
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
        minutes={minutes}
        defaultMinutes={appointment.duration_min}
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
