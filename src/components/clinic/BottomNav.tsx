'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, CalendarPlus, Plus, UserPlus, Users, X } from 'lucide-react'

// Two places to be (Today, Patients) and one button to add something
const isToday = (p: string) => p === '/app' || p.startsWith('/app/visits') || p.startsWith('/app/requests') || p.startsWith('/app/appointments') || p.startsWith('/app/book')
const isPatients = (p: string) => p.startsWith('/app/patients')

export function BottomNav() {
  const pathname = usePathname()
  const [adding, setAdding] = useState(false)

  const tab = (href: string, name: string, Icon: typeof Users, active: boolean) => (
    <Link href={href} onClick={() => setAdding(false)}
      className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-semibold ${active ? 'text-blue-600' : 'text-gray-500'}`}>
      <Icon className="h-6 w-6" />
      {name}
    </Link>
  )

  return (
    <>
      {adding && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setAdding(false)} aria-hidden="true" />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {adding && (
          <div className="mx-auto max-w-lg space-y-2 px-4 pt-4">
            <Link href="/app/patients/new" onClick={() => setAdding(false)}
              className="flex items-center gap-3 rounded-2xl bg-blue-600 px-5 py-4 text-lg font-semibold text-white shadow-sm">
              <UserPlus className="h-6 w-6" /> New patient (walk-in)
            </Link>
            <Link href="/app/book" onClick={() => setAdding(false)}
              className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-lg font-semibold text-gray-900 ring-1 ring-gray-300">
              <CalendarPlus className="h-6 w-6 text-blue-600" /> Book an appointment
            </Link>
          </div>
        )}

        <div className="mx-auto flex max-w-lg items-center">
          {tab('/app', 'Today', CalendarDays, isToday(pathname) && !adding)}
          <div className="flex flex-1 justify-center">
            <button type="button" aria-label={adding ? 'Close' : 'Add'} aria-expanded={adding} onClick={() => setAdding((a) => !a)}
              className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 active:scale-95">
              {adding ? <X className="h-7 w-7" /> : <Plus className="h-7 w-7" />}
            </button>
          </div>
          {tab('/app/patients', 'Patients', Users, isPatients(pathname) && !adding)}
        </div>
      </nav>
    </>
  )
}
