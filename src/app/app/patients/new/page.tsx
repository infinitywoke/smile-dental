import { Suspense } from 'react'
import { getDoctor } from '@/lib/auth'
import { createPatient } from '@/lib/actions/patients'
import { PatientForm } from '@/components/clinic/PatientForm'
import { ScreenLoading } from '@/components/clinic/ui'

async function NewPatientPageContent() {
  await getDoctor()
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">New patient</h1>
      <PatientForm action={createPatient} submitLabel="Start visit" />
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
