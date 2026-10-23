'use client'

import { useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
import { clearOutbox } from '@/lib/offline/outbox'
import { forgetAllPhotos } from '@/lib/offline/photo-store'
import { forgetCopies, forgetLock } from '@/lib/offline/worker'
import { useOnline, useOutbox } from './Outbox'

// Notes typed but not saved, saves waiting for the signal, photos not yet uploaded and the screens kept
// for when there is no signal all stay on the phone. Signing out removes them, so nothing about a
// patient is left behind on a phone that is lent or sold.
async function forgetThisPhone() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('visit-draft:')) localStorage.removeItem(key)
    }
    clearOutbox()
  } catch {
    // Storage can be unavailable; signing out still goes ahead
  }
  forgetLock()
  await Promise.all([forgetCopies(), forgetAllPhotos()])
}

export function SignOutButton() {
  const waiting = useOutbox().length
  const online = useOnline()
  // Changes not saved yet are lost by signing out: he is told first, and a second tap signs out
  const [warned, setWarned] = useState(false)
  const leaving = useRef(false)

  async function signOut(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (leaving.current) return
    if (waiting > 0 && !warned) {
      setWarned(true)
      return
    }
    const form = event.currentTarget
    leaving.current = true
    await forgetThisPhone()
    form.submit()
  }

  return (
    <form action="/auth/signout" method="post" onSubmit={signOut} className="space-y-2">
      {warned && waiting > 0 && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {waiting === 1 ? "1 change hasn't saved yet. Signing out deletes it" : `${waiting} changes haven't saved yet. Signing out deletes them`} from this phone.
        </p>
      )}
      {!online && <p className="text-center text-sm text-gray-600">No signal: you can sign out when it&apos;s back.</p>}
      <button type="submit" disabled={!online}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-base font-semibold text-gray-700 ring-1 ring-gray-300 disabled:opacity-60">
        <LogOut className="h-5 w-5 text-gray-500" /> {warned && waiting > 0 ? 'Sign out anyway' : 'Sign out'}
      </button>
    </form>
  )
}
