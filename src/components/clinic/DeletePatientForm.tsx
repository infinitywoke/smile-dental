'use client'

import { useState, useTransition } from 'react'
import { AlertCircle } from 'lucide-react'
import { deletePatient, type DeleteMode } from '@/lib/actions/delete-patient'
import { formatRupees } from '@/lib/pricing'

// The password, then one button (no payments) or the choice to keep the payments in the books
export function DeletePatientForm({ patientId, paymentsTotal }: { patientId: string; paymentsTotal: number }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(mode: DeleteMode) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await deletePatient(patientId, mode, password)
        if (result?.error) setError(result.error)
      } catch (e) {
        // The redirect after a delete arrives as a thrown signal that Next handles; anything else is a lost connection
        if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e
        setError("Couldn't reach the server. Check the internet and try again.")
      }
    })
  }

  const ready = password.length > 0 && !pending
  const red = 'min-h-14 w-full rounded-2xl px-5 text-base font-semibold disabled:opacity-50'
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-semibold text-gray-700">Type your password to delete</label>
        <input id="password" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="block min-h-12 w-full rounded-xl border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-red-600" />
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {paymentsTotal > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            This patient paid {formatRupees(paymentsTotal)}. Keep it in the books (your totals stay right), or delete it too.
          </p>
          <button type="button" disabled={!ready} onClick={() => run('keep-money')}
            className={`${red} bg-white text-red-700 ring-2 ring-inset ring-red-600`}>
            {pending ? 'Deleting…' : `Delete patient, keep ${formatRupees(paymentsTotal)} in the books`}
          </button>
          <button type="button" disabled={!ready} onClick={() => run('everything')} className={`${red} bg-red-600 text-white`}>
            {pending ? 'Deleting…' : `Delete everything, including ${formatRupees(paymentsTotal)} of payments`}
          </button>
        </div>
      ) : (
        <button type="button" disabled={!ready} onClick={() => run('everything')} className={`${red} bg-red-600 text-white`}>
          {pending ? 'Deleting…' : 'Delete patient'}
        </button>
      )}
    </div>
  )
}
