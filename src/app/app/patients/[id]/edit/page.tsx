import { Suspense } from 'react'
import { getClinic } from '@/lib/data/clinic'
import { getPatient } from '@/lib/data/patients'
import { patientAge } from '@/lib/patient-fields'
import { updatePatient } from '@/lib/actions/patients'
import { PatientForm } from '@/components/clinic/PatientForm'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'

async function EditPatientPageContent({ params }: PageProps<'/app/patients/[id]/edit'>) {
  const { id } = await params
  const [patient, { clinic }] = await Promise.all([getPatient(id), getClinic()])

  return (
    <div className="space-y-5">
      <BackLink href={`/app/patients/${id}`} label={patient.name} />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Edit details</h1>
      <PatientForm key={patient.updated_at} action={updatePatient.bind(null, id)} patient={patient} age={patientAge(patient)} submitLabel="Save changes" languages={clinic.languages} />
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function EditPatientPage(props: PageProps<'/app/patients/[id]/edit'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <EditPatientPageContent {...props} />
    </Suspense>
  )
}
