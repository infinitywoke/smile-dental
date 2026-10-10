import { Suspense } from 'react'
import { getDoctor } from '@/lib/auth'
import { getPatient } from '@/lib/data/patients'
import { formatDate, todayInIndia } from '@/lib/dates'
import { VisitEditor } from '@/components/clinic/VisitEditor'
import { BackLink, MedicalAlert, ScreenLoading } from '@/components/clinic/ui'

async function NewVisitPageContent({ params, searchParams }: PageProps<'/app/patients/[id]/visits/new'>) {
  const { id } = await params
  const { appointmentId } = await searchParams
  const [doctor, patient] = await Promise.all([getDoctor(), getPatient(id)])

  return (
    <div className="space-y-5">
      <BackLink href={`/app/patients/${id}`} label={patient.name} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">New visit</h1>
        <p className="mt-1 text-sm text-gray-500">{patient.name} · {formatDate(todayInIndia())}</p>
      </div>
      <MedicalAlert alerts={patient.medical_alerts} />
      <VisitEditor
        mode="create"
        doctorId={doctor.id}
        patientId={patient.id}
        appointmentId={typeof appointmentId === 'string' ? appointmentId : undefined}
        continueLabel="Next: Bill"
      />
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function NewVisitPage(props: PageProps<'/app/patients/[id]/visits/new'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <NewVisitPageContent {...props} />
    </Suspense>
  )
}
