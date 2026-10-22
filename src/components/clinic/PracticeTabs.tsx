'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The Practice tab's four parts, at the top of each: the back office, kept out of the way of the day
const TABS = [
  { href: '/app/insights', name: 'Money', match: (p: string) => p.startsWith('/app/insights') || p.startsWith('/app/tally') },
  { href: '/app/costs', name: 'Costs', match: (p: string) => p.startsWith('/app/costs') },
  { href: '/app/stock', name: 'Stock', match: (p: string) => p.startsWith('/app/stock') },
  { href: '/app/settings', name: 'Settings', match: (p: string) => p.startsWith('/app/settings') || p.startsWith('/app/notifications') },
]

export function PracticeTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label="Practice" className="grid grid-cols-4 gap-1 rounded-2xl bg-gray-100 p-1">
      {TABS.map((tab) => {
        const active = tab.match(pathname)
        return (
          <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 items-center justify-center rounded-xl text-sm font-bold transition-colors ${
              active ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'
            }`}>
            {tab.name}
          </Link>
        )
      })}
    </nav>
  )
}
