'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BriefcaseMedical, CalendarDays, Plus, Users } from 'lucide-react'

// Three places (Today, Patients, and Practice: money, costs, stock and settings) and, at the thumb, the
// button for a walk-in. A small amber dot on Practice says stock is low or expiring.
const isToday = (p: string) => p === '/app' || p.startsWith('/app/visits') || p.startsWith('/app/requests') || p.startsWith('/app/appointments') || p.startsWith('/app/book')
const isPatients = (p: string) => p.startsWith('/app/patients') && p !== '/app/patients/new'
const isPractice = (p: string) => ['/app/insights', '/app/tally', '/app/costs', '/app/stock', '/app/settings', '/app/notifications'].some((s) => p.startsWith(s))

export function BottomNav({ stockAlert }: { stockAlert: boolean }) {
  const pathname = usePathname()

  // The whole slot is the link, not just the words; the open place has a mark under its name
  const tab = (href: string, name: string, Icon: typeof Users, active: boolean, dot = false) => (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors ${active ? 'text-gray-900' : 'text-gray-500'}`}>
      <Icon className="h-6 w-6" strokeWidth={active ? 2.3 : 2} aria-hidden="true" />
      {name}
      {dot && (
        <span className="absolute top-2 left-[calc(50%+6px)] h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white">
          <span className="sr-only">, stock low</span>
        </span>
      )}
      <span className={`h-[3px] w-4 rounded-full transition-colors ${active ? 'bg-gray-900' : 'bg-transparent'}`} aria-hidden="true" />
    </Link>
  )

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg items-center gap-1 pr-3 pl-1">
        {tab('/app', 'Today', CalendarDays, isToday(pathname))}
        {tab('/app/patients', 'Patients', Users, isPatients(pathname))}
        {tab('/app/insights', 'Practice', BriefcaseMedical, isPractice(pathname), stockAlert)}
        <Link href="/app/patients/new"
          className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-[14px] bg-blue-600 px-4 text-[15px] font-extrabold text-white transition-transform active:scale-95">
          <Plus className="h-5 w-5" strokeWidth={2.6} aria-hidden="true" />Walk-in
        </Link>
      </div>
    </nav>
  )
}
