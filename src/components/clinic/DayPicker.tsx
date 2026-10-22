'use client'

import { useRouter } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { FullScreen, useBackToClose } from './FullScreen'

export type PickerDay = { href: string; name: string; number: number; note: string; active: boolean; closed: boolean }

// The date under the day's title: a tap shows the next two weeks, each with how many are booked
export function DayPicker({ label, days }: { label: string; days: PickerDay[] }) {
  const router = useRouter()
  const { open, show, close } = useBackToClose()

  // The sheet has its own history entry: take it off first, then go, so Back from the new day isn't the sheet
  function go(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    event.preventDefault()
    window.addEventListener('popstate', () => router.push(href), { once: true })
    close()
  }

  return (
    <>
      <button type="button" onClick={show}
        className="-ml-1 flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-gray-500 hover:bg-gray-100">
        <CalendarDays className="h-4 w-4" aria-hidden="true" />{label}
      </button>
      {open && (
        <FullScreen title="Pick a day" onClose={close}>
          <ul className="grid grid-cols-4 gap-2 p-4">
            {days.map((day) => (
              <li key={day.href}>
                <a href={day.href} onClick={(event) => go(event, day.href)}
                  className={`flex min-h-16 flex-col items-center justify-center rounded-xl px-1 py-2 text-xs ring-1 ring-inset ${
                    day.active ? 'bg-blue-600 text-white ring-blue-600' : day.closed ? 'bg-gray-100 text-gray-500 ring-gray-200' : 'bg-white text-gray-700 ring-gray-300'
                  }`}>
                  <span className="font-semibold">{day.name}</span>
                  <span className="hud-mono text-base font-bold">{day.number}</span>
                  <span className={day.active ? 'text-blue-100' : 'text-gray-500'}>{day.note}</span>
                </a>
              </li>
            ))}
          </ul>
        </FullScreen>
      )}
    </>
  )
}
