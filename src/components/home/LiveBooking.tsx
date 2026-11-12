'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { siteConfig, type HomeService } from '@/config/site'
import { reasonFromLink } from '@/lib/booking-reasons'
import { todayInIndia } from '@/lib/dates'
import { confirmationPromise } from '@/lib/schedule'
import { BookingCard } from './BookingCard'
import { BookingByPhone, BookingLoading } from './booking-parts'
import { fetchOpenTimes, type OpenTimes } from './open-times'

// The booking card with the clinic's free times at the moment the page is opened, fetched here in the browser.
// A booking link may carry the reason (?reason=rootcanal), which the card then starts with.
export function LiveBooking({ services }: { services: HomeService[] }) {
  const reason = reasonFromLink(useSearchParams().get('reason') ?? undefined)
  const [times, setTimes] = useState<OpenTimes | 'unavailable' | null>(null)

  // Fetched again when a chosen time turns out to be taken; the card stays as it is meanwhile
  const load = useCallback((fresh: boolean) => {
    let live = true
    fetchOpenTimes(fresh).then((answer) => {
      if (live) setTimes(answer ?? 'unavailable')
    })
    return () => {
      live = false
    }
  }, [])
  useEffect(() => load(false), [load])

  if (times === null) return <BookingLoading />
  if (times === 'unavailable') return <BookingByPhone why="unavailable" />
  if (times.paused) return <BookingByPhone why="paused" />
  return (
    <BookingCard slots={times.slots} today={todayInIndia()} promise={confirmationPromise(new Date(), siteConfig.dentist.short)}
      initialReason={reason} services={services} onTimesTaken={() => load(true)} />
  )
}
