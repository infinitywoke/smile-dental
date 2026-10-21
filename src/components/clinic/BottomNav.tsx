'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Plus, Settings, Users, Wallet } from 'lucide-react'

// The places to be (Today, Patients, Money, Settings) and, in the middle, the button that adds a patient
const isToday = (p: string) => p === '/app' || p.startsWith('/app/visits') || p.startsWith('/app/requests') || p.startsWith('/app/appointments') || p.startsWith('/app/book')
const isPatients = (p: string) => p.startsWith('/app/patients') && p !== '/app/patients/new'
const isMoney = (p: string) => p.startsWith('/app/insights') || p.startsWith('/app/tally')
const isSettings = (p: string) => p.startsWith('/app/settings') || p.startsWith('/app/notifications')

export function BottomNav() {
  const pathname = usePathname()

  // The whole slot is the link, not just the words; the open place has an amber mark under its name
  const tab = (href: string, name: string, Icon: typeof Users, active: boolean) => (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${active ? 'text-blue-600' : 'text-gray-500'}`}>
      <Icon className="h-6 w-6" strokeWidth={active ? 2.3 : 2} />
      {name}
      <span className={`h-[3px] w-4 rounded-full transition-colors ${active ? 'bg-[#FFC46B]' : 'bg-transparent'}`} aria-hidden="true" />
    </Link>
  )

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center px-1">
        {tab('/app', 'Today', CalendarDays, isToday(pathname))}
        {tab('/app/patients', 'Patients', Users, isPatients(pathname))}
        <div className="flex flex-1 justify-center">
          <Link href="/app/patients/new" aria-label="New patient"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFC46B] text-[#0B2357] shadow-[0_0_0_6px_rgba(255,196,107,0.18)] transition-transform active:scale-95">
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </Link>
        </div>
        {tab('/app/insights', 'Money', Wallet, isMoney(pathname))}
        {tab('/app/settings', 'Settings', Settings, isSettings(pathname))}
      </div>
    </nav>
  )
}
