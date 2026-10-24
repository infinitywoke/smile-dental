'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { clinicWorker, keepCopies, keepsCopies, setUpLock } from '@/lib/offline/worker'
import { useOnline } from './Outbox'
import { useCanLock, useLockIsSet } from './OfflineLock'

const QUARTER_HOUR = 15 * 60_000
const HOUR = 60 * 60_000
// A screen is kept once it has stayed open this long: keeping it means fetching it whole once more, so
// it waits until he has finished opening it, and a screen he only passes through isn't fetched twice
const SETTLE_MS = 10_000
// Today's visits and patients are kept once Today has been quiet this long, never on a slow connection
const LIST_SETTLE_MS = 15_000
const LIST_MAX = 12
// "Not now" on the lock: asked again after this long
const LATER = 'clinic-lock-later'
const LATER_MS = 30 * 24 * HOUR
const noSubscribe = () => () => {}
// A slow connection, or the phone saving data: only the screens he opens are kept
function slowConnection(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return !!connection && (connection.saveData === true || /2g$|^3g$/.test(connection.effectiveType ?? ''))
}
const askedLately = () => {
  try {
    return Date.now() - Number(localStorage.getItem(LATER) ?? 0) < LATER_MS
  } catch {
    return true
  }
}

// On every screen: starts the service worker, and has each screen he opens kept on the phone (once it
// has stayed open a few seconds, at most every quarter of an hour), so it opens again with no signal.
// A screen loaded as a whole page is kept as it loads, and one with a change saved once the changes
// stop (public/sw.js). On Today, once: the lock that opens kept screens with this phone's fingerprint
// or PIN, until it is set up.
export function OfflineCopies() {
  const pathname = usePathname()
  useEffect(() => {
    void clinicWorker()
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => void keepCopies([location.pathname + location.search], QUARTER_HOUR), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [pathname])

  const online = useOnline()
  const set = useLockIsSet()
  const able = useCanLock()
  const later = useSyncExternalStore(noSubscribe, askedLately, () => true)
  const [hidden, setHidden] = useState(false)
  if (pathname !== '/app' || !online || !able || set || later || hidden || !keepsCopies()) return null

  function notNow() {
    try {
      localStorage.setItem(LATER, String(Date.now()))
    } catch {
      // No storage: asked again next time
    }
    setHidden(true)
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-3">
      <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200">
        <p className="flex items-start gap-2 text-sm text-gray-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
          <span><span className="font-semibold">Lock the screens kept for no signal.</span> With no signal they open only after this phone&apos;s fingerprint or PIN.</span>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void setUpLock()}
            className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">
            Set up the lock
          </button>
          <button type="button" onClick={notNow}
            className="flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold text-gray-700 ring-1 ring-gray-300">
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

// Today: the day's visits and patients (the first dozen), kept while there is signal, so each opens
// with none. Only once Today has been quiet a while, so the screens he opens come first.
export function KeepCopies({ urls }: { urls: string[] }) {
  const list = urls.join(' ')
  useEffect(() => {
    if (slowConnection()) return
    const timer = setTimeout(() => void keepCopies(list.split(' ').filter(Boolean).slice(0, LIST_MAX), HOUR), LIST_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [list])
  return null
}
