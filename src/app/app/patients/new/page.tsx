import { Suspense } from 'react'
import { getClinic } from '@/lib/data/clinic'
import { createPatient } from '@/lib/actions/patients'
import { PatientForm } from '@/components/clinic/PatientForm'
import { ScreenLoading } from '@/components/clinic/ui'

async function NewPatientPageContent() {
  const { clinic } = await getClinic()
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">New patient</h1>
      <PatientForm action={createPatient} submitLabel="Start visit" languages={clinic.languages} />
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function NewPatientPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <NewPatientPageContent />
    </Suspense>
  )
}
