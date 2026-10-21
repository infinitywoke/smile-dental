'use client'

import { useEffect, useState } from 'react'
import { openStatus, type OpenStatus as Status } from '@/lib/clinic-hours'

// "Open now · until 1:00 PM": worked out in the visitor's browser from India time, again every minute.
// Blank until then, so the page as sent and the page in the browser agree.
export function OpenStatus({ className = '' }: { className?: string }) {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    const update = () => setStatus(openStatus(new Date()))
    update()
    const timer = setInterval(update, 60_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <p className={`h-status${status ? (status.open ? ' open' : ' closed') : ''} ${className}`} aria-live="polite">
      <span className="h-status-dot" aria-hidden="true" />
      {status?.text ?? ' '}
    </p>
  )
}
