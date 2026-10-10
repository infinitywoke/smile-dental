import { getDoctor } from '@/lib/auth'
import { createPatient } from '@/lib/actions/patients'
import { PatientForm } from '@/components/clinic/PatientForm'
import { BackLink } from '@/components/clinic/ui'

export default async function NewPatientPage() {
  await getDoctor()
  return (
    <div className="space-y-5">
      <BackLink href="/app" label="Today" />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">New patient</h1>
      <PatientForm action={createPatient} submitLabel="Save and start visit" />
    </div>
  )
}
