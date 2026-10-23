'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/report-error'

// Errors on Clinic OS screens that nothing else caught are reported (src/lib/report-error.ts); ones a
// screen catches itself are reported by app/app/error.tsx
export function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportError(event.error ?? event.message)
    const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
