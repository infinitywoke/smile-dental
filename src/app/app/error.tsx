'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { reportError } from '@/lib/report-error'

// Shown when a Clinic OS screen fails to load (e.g. no connection). The error is reported, so the owner
// hears of one that isn't a lost connection (src/lib/report-error.ts).
export default function ClinicError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportError(error)
  }, [error])

  return (
    <div className="space-y-4 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-gray-200">
      <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
      <div>
        <h1 className="text-lg font-bold text-gray-900">This screen didn&apos;t load</h1>
        <p className="mt-1 text-sm text-gray-600">Check the internet connection and try again.</p>
      </div>
      <button type="button" onClick={() => retry()}
        className="min-h-12 w-full rounded-full bg-blue-600 px-5 py-3 text-base font-semibold text-white hover:bg-blue-700">
        Try again
      </button>
      <Link href="/app" className="flex min-h-12 items-center justify-center text-base font-medium text-blue-600">Go to Today</Link>
    </div>
  )
}
