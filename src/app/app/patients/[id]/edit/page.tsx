import { getPatient } from '@/lib/data/patients'
import { updatePatient } from '@/lib/actions/patients'
import { PatientForm } from '@/components/clinic/PatientForm'
import { BackLink } from '@/components/clinic/ui'

export default async function EditPatientPage({ params }: PageProps<'/app/patients/[id]/edit'>) {
  const { id } = await params
  const patient = await getPatient(id)

  return (
    <div className="space-y-5">
      <BackLink href={`/app/patients/${id}`} label={patient.name} />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Edit details</h1>
      <PatientForm key={patient.updated_at} action={updatePatient.bind(null, id)} patient={patient} submitLabel="Save changes" />
    </div>
  )
}
