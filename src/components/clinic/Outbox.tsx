'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CloudOff, Loader2 } from 'lucide-react'
import { addCharge, recordPayment, removeCharge, removePayment } from '@/lib/actions/billing'
import { setPhotoKind } from '@/lib/actions/visits'
import { dropFromOutbox, enqueue, isNetworkError, markFailed, readOutbox, subscribeOutbox, type QueuedAction, type QueuedSave } from '@/lib/offline/outbox'
import { formatRupees } from '@/lib/pricing'
import type { Save } from './BillTools'

type Result = { error?: string; queued?: boolean }
type Runner = (...args: unknown[]) => Promise<Result>
const ACTIONS: Record<QueuedAction, Runner> = {
  addCharge: addCharge as Runner,
  removeCharge: removeCharge as Runner,
  recordPayment: recordPayment as Runner,
  removePayment: removePayment as Runner,
  setPhotoKind: setPhotoKind as Runner,
}

const EMPTY: QueuedSave[] = []
export const useOutbox = () => useSyncExternalStore(subscribeOutbox, readOutbox, () => EMPTY)

const subscribeOnline = (listener: () => void) => {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)

// The visit's saves that can wait for the signal. Each is tried at once (after the typed notes, through
// save); with no signal it joins the outbox and counts as done, so the page goes on as if it saved.
// While anything waits, new ones queue behind it, so they reach the server in the order he tapped.
export type QueuedSaves = {
  addCharge: (...args: Parameters<typeof addCharge>) => Promise<Result>
  removeCharge: (...args: Parameters<typeof removeCharge>) => Promise<Result>
  recordPayment: (...args: Parameters<typeof recordPayment>) => Promise<Result>
  removePayment: (...args: Parameters<typeof removePayment>) => Promise<Result>
  setPhotoKind: (...args: Parameters<typeof setPhotoKind>) => Promise<Result>
}

export function useQueuedSaves(visitId: string, save: Save): QueuedSaves {
  const run = useCallback((action: QueuedAction, args: unknown[]): Promise<Result> => {
    const waiting = readOutbox().some((i) => !i.error)
    if (waiting || navigator.onLine === false) {
      enqueue({ visitId, action, args })
      return Promise.resolve({ queued: true })
    }
    return save(async () => {
      try {
        return await ACTIONS[action](...args)
      } catch (e) {
        if (!isNetworkError(e)) throw e
        enqueue({ visitId, action, args })
        return { queued: true }
      }
    })
  }, [visitId, save])
  return useMemo(() => ({
    addCharge: (...args) => run('addCharge', args),
    removeCharge: (...args) => run('removeCharge', args),
    recordPayment: (...args) => run('recordPayment', args),
    removePayment: (...args) => run('removePayment', args),
    setPhotoKind: (...args) => run('setPhotoKind', args),
  }), [run])
}

const SavesContext = createContext<QueuedSaves | null>(null)
export const SavesProvider = SavesContext.Provider
export function useSaves(): QueuedSaves {
  const saves = useContext(SavesContext)
  if (!saves) throw new Error('useSaves outside a visit')
  return saves
}

// What a waiting save is, in words
function describe(item: QueuedSave): string {
  switch (item.action) {
    case 'addCharge': {
      const input = item.args[1] as { description: string; amount: number }
      return `${input.description}: ${formatRupees(input.amount)}`
    }
    case 'recordPayment':
      return `Payment of ${formatRupees(Number(item.args[1]))}`
    case 'removeCharge':
      return 'Removing a charge'
    case 'removePayment':
      return 'Removing a payment'
    case 'setPhotoKind':
      return "A photo's kind"
  }
}

// On every screen: sends what waits as soon as there is signal (when it comes back, when the app is
// opened again, and every 15 seconds while anything waits), in order, and says how it stands. A save
// the server turns down stays listed with its reason until he lets it go.
export function OutboxSync() {
  const items = useOutbox()
  const online = useOnline()
  const router = useRouter()
  const sending = useRef(false)
  const [busy, setBusy] = useState(false)

  const flush = useCallback(async () => {
    if (sending.current || navigator.onLine === false) return
    const waiting = readOutbox().filter((i) => !i.error)
    if (waiting.length === 0) return
    sending.current = true
    setBusy(true)
    let saved = 0
    try {
      for (const item of waiting) {
        try {
          const result = await ACTIONS[item.action](...item.args)
          if (result?.error) markFailed(item.id, result.error)
          else {
            dropFromOutbox(item.id)
            saved++
          }
        } catch (e) {
          if (isNetworkError(e)) break
          markFailed(item.id, "Couldn't save this.")
        }
      }
    } finally {
      sending.current = false
      setBusy(false)
    }
    // The screens show the server's copy again
    if (saved > 0) router.refresh()
  }, [router])

  useEffect(() => {
    const onOnline = () => void flush()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flush()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [flush])

  const waiting = items.filter((i) => !i.error)
  const failed = items.filter((i) => i.error)
  useEffect(() => {
    if (waiting.length === 0) return
    const soon = setTimeout(() => void flush(), 500)
    const timer = setInterval(() => void flush(), 15_000)
    return () => {
      clearTimeout(soon)
      clearInterval(timer)
    }
  }, [waiting.length, flush])

  const changes = (n: number) => (n === 1 ? '1 change' : `${n} changes`)
  if (online && waiting.length === 0 && failed.length === 0) return null
  return (
    <div className="mx-auto w-full max-w-lg space-y-2 px-4 pt-3">
      {(!online || waiting.length > 0) && (
        <p role="status" className="flex min-h-11 items-center gap-2 rounded-xl bg-amber-50 px-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
          {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />}
          {!online
            ? waiting.length > 0 ? `No signal: ${changes(waiting.length)} will save when it's back` : "No signal: what you do now saves when it's back"
            : busy ? `Saving ${changes(waiting.length)}…` : `${changes(waiting.length)} waiting to save`}
        </p>
      )}
      {failed.map((item) => (
        <div key={item.id} role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 py-1 pl-3 pr-1 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="mt-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 py-2"><span className="font-semibold">Not saved: {describe(item)}.</span> {item.error}</p>
          <button type="button" onClick={() => dropFromOutbox(item.id)} className="min-h-11 shrink-0 rounded-lg px-3 font-semibold">
            Let it go
          </button>
        </div>
      ))}
    </div>
  )
}
