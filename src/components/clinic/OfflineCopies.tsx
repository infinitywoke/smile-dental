'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { clinicWorker, keepCopies } from '@/lib/offline/worker'

const FEW_MINUTES = 5 * 60_000
const HOUR = 60 * 60_000

// On every screen: starts the service worker, and has each screen he opens kept on the phone (at most
// every few minutes), so it opens again with no signal. A screen loaded as a whole page is kept as it
// loads, and one with a change saved a few seconds after (public/sw.js).
export function OfflineCopies() {
  const pathname = usePathname()
  useEffect(() => {
    void clinicWorker()
  }, [])
  useEffect(() => {
    void keepCopies([location.pathname + location.search], FEW_MINUTES)
  }, [pathname])
  return null
}

// Today: the day's visits and patients, kept while there is signal, so each opens with none
export function KeepCopies({ urls }: { urls: string[] }) {
  const list = urls.join(' ')
  useEffect(() => {
    void keepCopies(list.split(' ').filter(Boolean), HOUR)
  }, [list])
  return null
}
