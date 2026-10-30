import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarX, MessageCircle } from 'lucide-react'
import { getAppointment } from '@/lib/data/appointments'
import { getClinic } from '@/lib/data/clinic'
import { formatBlock, formatDay, inIndia } from '@/lib/schedule'
import { cancelledMessage, firstName, messageLanguage, whatsappLink } from '@/lib/whatsapp'
import { ScreenLoading } from '@/components/clinic/ui'

// Right after Cancel: the time is free again; one optional tap tells the patient on WhatsApp
async function CancelledContent({ params }: PageProps<'/app/appointments/[id]/cancelled'>) {
  const { id } = await params
  const [appointment, clinic] = await Promise.all([getAppointment(id), getClinic()])
  const patientHref = `/app/patients/${appointment.patient_id}`
  if (appointment.status !== 'cancelled') redirect(patientHref)

  const { name, phone } = appointment.patient
  const { date, time } = inIndia(appointment.starts_at)
  const whatsappUrl = phone ? whatsappLink(phone, cancelledMessage(clinic, { name, startsAt: appointment.starts_at, language: messageLanguage(appointment.patient.language) })) : null

  return (
    <div className="space-y-4 rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-gray-200">
      <CalendarX className="mx-auto h-10 w-10 text-gray-500" />
      <div>
        <h1 className="text-xl font-bold text-gray-900">Appointment cancelled</h1>
        <p className="mt-1 text-gray-700">{name} · {formatDay(date)}, {formatBlock(time)}</p>
        <p className="mt-1 text-sm text-gray-500">The time is free again.</p>
      </div>
      {whatsappUrl && (
        <a href={whatsappUrl}
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-lg font-semibold text-white">
          <MessageCircle className="h-6 w-6" /> Tell {firstName(name)} on WhatsApp
        </a>
      )}
      <Link href={patientHref} replace className="flex min-h-12 items-center justify-center text-base font-semibold text-blue-700">
        Back to {name}
      </Link>
    </div>
  )
}

export default function CancelledPage(props: PageProps<'/app/appointments/[id]/cancelled'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <CancelledContent {...props} />
    </Suspense>
  )
}
