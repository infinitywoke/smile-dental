import { getDoctor } from '@/lib/auth'
import { getPatient } from '@/lib/data/patients'
import { formatDate, todayInIndia } from '@/lib/dates'
import { VisitEditor } from '@/components/clinic/VisitEditor'
import { BackLink, MedicalAlert } from '@/components/clinic/ui'

export default async function NewVisitPage({ params }: PageProps<'/app/patients/[id]/visits/new'>) {
  const { id } = await params
  const [doctor, patient] = await Promise.all([getDoctor(), getPatient(id)])

  return (
    <div className="space-y-5">
      <BackLink href={`/app/patients/${id}`} label={patient.name} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">New visit</h1>
        <p className="mt-1 text-sm text-gray-500">{patient.name} · {formatDate(todayInIndia())}</p>
      </div>
      <MedicalAlert alerts={patient.medical_alerts} />
      <VisitEditor mode="create" doctorId={doctor.id} patientId={patient.id} />
    </div>
  )
}
