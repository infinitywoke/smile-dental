import Link from 'next/link'
import { Suspense } from 'react'
import { Bell } from 'lucide-react'
import { searchPatients } from '@/lib/data/patients'
import { formatPhone } from '@/lib/phone'
import { patientAge } from '@/lib/patient-fields'
import { ScreenLoading } from '@/components/clinic/ui'
import { PatientSearch } from '@/components/clinic/PatientSearch'
import { SignOutButton } from '@/components/clinic/SignOutButton'

async function PatientsPageContent() {
  const patients = await searchPatients('')
  const initial = patients.map((patient) => {
    const age = patientAge(patient)
    return {
      id: patient.id,
      name: patient.name,
      detail: [formatPhone(patient.phone), age !== null && `${age} yrs`].filter(Boolean).join(' · ') || 'No phone',
      alert: !!patient.medical_alerts,
    }
  })

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Patients</h1>
      <PatientSearch initial={initial} />
      <div className="space-y-2 pt-6">
        <Link href="/app/notifications" className="flex min-h-12 items-center gap-2 rounded-xl bg-white px-4 font-medium text-gray-800 ring-1 ring-gray-200">
          <Bell className="h-5 w-5 text-blue-600" aria-hidden="true" /> Notifications
        </Link>
        <SignOutButton />
      </div>
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function PatientsPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <PatientsPageContent />
    </Suspense>
  )
}
