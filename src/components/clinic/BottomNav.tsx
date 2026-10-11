'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Plus, Users } from 'lucide-react'

// Two places to be (Today, Patients) and one button that adds a patient
const isToday = (p: string) => p === '/app' || p.startsWith('/app/visits') || p.startsWith('/app/requests') || p.startsWith('/app/appointments') || p.startsWith('/app/book')
const isPatients = (p: string) => p.startsWith('/app/patients')

export function BottomNav() {
  const pathname = usePathname()

  // The whole half of the bar is the link, not just the words
  const tab = (href: string, name: string, Icon: typeof Users, active: boolean) => (
    <Link href={href}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${active ? 'text-blue-600' : 'text-gray-500'}`}>
      <Icon className="h-6 w-6" />
      {name}
    </Link>
  )

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg items-center">
        {tab('/app', 'Today', CalendarDays, isToday(pathname))}
        <div className="flex flex-1 justify-center">
          <Link href="/app/patients/new" aria-label="New patient"
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 active:scale-95">
            <Plus className="h-7 w-7" />
          </Link>
        </div>
        {tab('/app/patients', 'Patients', Users, isPatients(pathname) && pathname !== '/app/patients/new')}
      </div>
    </nav>
  )
}
