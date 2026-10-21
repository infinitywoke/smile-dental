'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { startVisit } from '@/lib/actions/visits'

// Opens today's visit for the patient (creating it if needed). A button, not a link: Next prefetches
// links, and a prefetch must never create a visit. One id per start, so a double tap makes one visit.
export function StartVisitButton({
  patientId,
  appointmentId,
  label = 'Start visit',
  className = 'flex min-h-14 w-full items-center justify-center rounded-2xl bg-blue-600 px-5 text-lg font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-70',
}: {
  patientId: string
  appointmentId?: string
  label?: string
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const visitIdRef = useRef<string | null>(null)

  // One id per start: kept while it opens (so a double tap makes one visit), fresh for the next start
  useEffect(() => {
    if (!pending) visitIdRef.current = null
  }, [pending])

  function start() {
    visitIdRef.current ??= crypto.randomUUID()
    const visitId = visitIdRef.current
    setError(null)
    // A short buzz on Android: the tap was taken
    navigator.vibrate?.(10)
    startTransition(async () => {
      // On success this opens the visit
      const result = await startVisit(patientId, visitId, appointmentId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <>
      <button type="button" onClick={start} disabled={pending} className={className}>
        {pending ? 'Opening…' : label}
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </>
  )
}
