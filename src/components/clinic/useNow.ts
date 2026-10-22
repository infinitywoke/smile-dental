'use client'

import { useEffect, useState } from 'react'

// The time now, worked out on the phone and again every so often; null until then, so the page as sent
// and the page in the browser agree
export function useNow(everyMs: number): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const timer = setInterval(tick, everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}
