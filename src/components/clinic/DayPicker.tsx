'use client'

import { useRouter } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { isClosedDay } from '@/lib/schedule'
import { Calendar } from './Calendar'
import { FullScreen, useBackToClose } from './FullScreen'

// The date under the day's title: a tap opens the calendar (days, months, years), with each day's
// holiday and how many are booked, to open any day before or after
export function DayPicker({ label, date, today }: { label: string; date: string; today: string }) {
  const router = useRouter()
  const { open, show, close } = useBackToClose()

  // The sheet has its own history entry: take it off first, then go, so Back from the new day isn't the sheet
  function go(day: string) {
    const href = day === today ? '/app' : `/app?d=${day}`
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
          <div className="p-4">
            <Calendar selected={date} today={today} isClosed={isClosedDay} pickClosed onSelect={go} />
          </div>
        </FullScreen>
      )}
    </>
  )
}
