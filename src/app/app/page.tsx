import { CalendarDays, UserPlus, Wallet } from 'lucide-react'
import { getDoctor } from '@/lib/auth'

const sections = [
  { name: 'Today', description: "Today's patients and visits", icon: CalendarDays, phase: 2 },
  { name: 'Patient', description: 'Add a new or walk-in patient', icon: UserPlus, phase: 2 },
  { name: 'Money', description: 'Expenses, daily close and insights', icon: Wallet, phase: 4 },
]

export default async function ClinicHomePage() {
  const doctor = await getDoctor()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Welcome, {doctor.name}</h1>
        <p className="mt-1 text-sm text-gray-500">Signed in as {doctor.email}</p>
      </div>

      <div className="space-y-3">
        {sections.map(({ name, description, icon: Icon, phase }) => (
          <div
            key={name}
            className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 opacity-60"
            aria-disabled="true"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Icon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-semibold text-gray-900">{name}</p>
              <p className="text-sm text-gray-500">{description}</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
              Phase {phase}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
