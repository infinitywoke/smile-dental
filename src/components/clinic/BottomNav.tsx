'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarClock, CalendarDays, UserPlus, Users, Wallet } from 'lucide-react'

const items = [
  { name: 'Today', href: '/app', icon: CalendarDays, match: (p: string) => p === '/app' || p.startsWith('/app/visits') },
  { name: 'Calendar', href: '/app/calendar', icon: CalendarClock, match: (p: string) => p.startsWith('/app/calendar') || p.startsWith('/app/requests') || p.startsWith('/app/appointments') },
  { name: 'Patients', href: '/app/patients', icon: Users, match: (p: string) => p.startsWith('/app/patients') && p !== '/app/patients/new' },
  { name: 'New', href: '/app/patients/new', icon: UserPlus, match: (p: string) => p === '/app/patients/new' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg">
        {items.map(({ name, href, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <Link key={name} href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-semibold ${active ? 'text-blue-600' : 'text-gray-500'}`}>
              <Icon className="h-6 w-6" />
              {name}
            </Link>
          )
        })}
        <span className="flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-semibold text-gray-300" aria-disabled="true" title="Coming in Phase 4">
          <Wallet className="h-6 w-6" />
          Money
        </span>
      </div>
    </nav>
  )
}
