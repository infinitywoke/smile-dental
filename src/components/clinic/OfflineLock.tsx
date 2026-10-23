'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { ShieldCheck } from 'lucide-react'
import { canLock, forgetCopies, lockIsSet, setUpLock, subscribeLock } from '@/lib/offline/worker'
import { Card } from './ui'

export const useLockIsSet = () => useSyncExternalStore(subscribeLock, lockIsSet, () => false)

// Whether this phone has a screen lock to check (null while it is asked)
export function useCanLock(): boolean | null {
  const [able, setAble] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    void canLock().then((yes) => {
      if (!cancelled) setAble(yes)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return able
}

// Settings: the screens kept for no signal, and the lock that opens them (public/sw.js)
export function OfflineLockCard() {
  const set = useLockIsSet()
  const able = useCanLock()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null)

  async function setUp() {
    setBusy(true)
    setMessage(null)
    const done = await setUpLock()
    setBusy(false)
    setMessage(done ? { text: "Done: kept screens open with this phone's fingerprint or PIN.", good: true } : { text: 'Not set up. Please try again.', good: false })
  }

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-semibold text-gray-900">Kept screens</p>
        <p className="text-sm text-gray-500">Screens you open are kept on this phone for a day, so they open with no signal. Signing out deletes them.</p>
      </div>
      {able === false ? (
        <p className="text-sm text-gray-700">This phone has no screen lock, so kept screens can&apos;t open with no signal. Set a fingerprint, face or PIN lock in the phone&apos;s settings.</p>
      ) : set ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <ShieldCheck className="h-5 w-5 text-gray-500" aria-hidden="true" /> Locked with this phone&apos;s fingerprint or PIN
        </p>
      ) : (
        <p className="text-sm text-gray-700">With no signal, they open only after this phone&apos;s fingerprint or PIN. Set this up once, with signal.</p>
      )}
      {able && (
        <button type="button" onClick={() => void setUp()} disabled={busy}
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-4 font-semibold text-gray-900 ring-1 ring-gray-300 disabled:opacity-60">
          {set ? 'Set up again' : 'Set up the lock'}
        </button>
      )}
      {message && <p role="status" className={`text-sm font-medium ${message.good ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>}
    </Card>
  )
}

// The login screen shows only when he is signed out: the screens kept on the phone go then too.
// Changes and photos still waiting stay; they are his, and go once he signs in again.
export function ForgetKeptScreens() {
  useEffect(() => {
    void forgetCopies()
  }, [])
  return null
}
