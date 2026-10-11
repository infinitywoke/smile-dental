import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAppointment } from '@/lib/data/appointments'
import { ScreenLoading } from '@/components/clinic/ui'

// Old links (Today, WhatsApp, bookmarks) land on the patient page, which now holds
// everything about an appointment.
async function AppointmentRedirect({ params, searchParams }: PageProps<'/app/appointments/[id]'>): Promise<null> {
  const { id } = await params
  const { move } = await searchParams
  const appointment = await getAppointment(id)
  redirect(move === '1' ? `/app/appointments/${id}/move` : `/app/patients/${appointment.patient_id}`)
  return null
}

export default function AppointmentPage(props: PageProps<'/app/appointments/[id]'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <AppointmentRedirect {...props} />
    </Suspense>
  )
}
