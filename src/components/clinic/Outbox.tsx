'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AlertCircle, CloudOff, History, Loader2, MessageCircle } from 'lucide-react'
import { addCharge, recordPayment, removeCharge, removePayment } from '@/lib/actions/billing'
import { bookNextVisit, markWhatsappSent, removeNextVisit, setPhotoKind } from '@/lib/actions/visits'
import { openWhatsApp } from '@/lib/whatsapp-business'
import { todayInIndia } from '@/lib/dates'
import { dropFromOutbox, enqueue, isNetworkError, markFailed, readOutbox, subscribeOutbox, type QueuedAction, type QueuedSave } from '@/lib/offline/outbox'
import { copyReplaced, onFreshCopy, readCopyAt, subscribeCopyAt } from '@/lib/offline/worker'
import { formatRupees } from '@/lib/pricing'
import { formatTimeOf, formatWhen, inIndia } from '@/lib/schedule'
import type { Save } from './BillTools'

// whatsappUrl: the next visit changed after the patient had the WhatsApp, so they are told the new time
type Result = { error?: string; queued?: boolean; whatsappUrl?: string }
type Runner = (...args: unknown[]) => Promise<Result>
const ACTIONS: Record<QueuedAction, Runner> = {
  addCharge: addCharge as Runner,
  removeCharge: removeCharge as Runner,
  recordPayment: recordPayment as Runner,
  removePayment: removePayment as Runner,
  setPhotoKind: setPhotoKind as Runner,
  bookNextVisit: bookNextVisit as Runner,
  removeNextVisit: removeNextVisit as Runner,
  markWhatsappSent: markWhatsappSent as Runner,
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
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)

// The visit's saves that can wait for the signal. Each is tried at once (after the typed notes, through
// save); with no signal it joins the outbox and counts as done, so the page goes on as if it saved.
// While anything waits, new ones queue behind it, so they reach the server in the order he tapped.
export type QueuedSaves = {
  addCharge: (...args: Parameters<typeof addCharge>) => Promise<Result>
  removeCharge: (...args: Parameters<typeof removeCharge>) => Promise<Result>
  recordPayment: (...args: Parameters<typeof recordPayment>) => Promise<Result>
  removePayment: (...args: Parameters<typeof removePayment>) => Promise<Result>
  setPhotoKind: (...args: Parameters<typeof setPhotoKind>) => Promise<Result>
  bookNextVisit: (...args: Parameters<typeof bookNextVisit>) => Promise<Result>
  removeNextVisit: (...args: Parameters<typeof removeNextVisit>) => Promise<Result>
  markWhatsappSent: (...args: Parameters<typeof markWhatsappSent>) => Promise<Result>
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
    bookNextVisit: (...args) => run('bookNextVisit', args),
    removeNextVisit: (...args) => run('removeNextVisit', args),
    markWhatsappSent: (...args) => run('markWhatsappSent', args),
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
      const input = item.args[1] as { description: string; amount: number; discount?: boolean }
      return `${input.description}: ${input.discount ? '−' : ''}${formatRupees(input.amount)}`
    }
    case 'recordPayment':
      return `Payment of ${formatRupees(Number(item.args[1]))}`
    case 'removeCharge':
      return 'Removing a charge'
    case 'removePayment':
      return 'Removing a payment'
    case 'setPhotoKind':
      return "A photo's kind"
    case 'bookNextVisit':
      return `Next visit ${formatWhen(String(item.args[1]))}`
    case 'removeNextVisit':
      return 'Removing the next visit'
    case 'markWhatsappSent':
      return 'That the WhatsApp was sent'
  }
}

// When a kept copy was made: "at 10:42 AM" today, "on Thu, 15 Oct, 2:40 PM" before
function keptWhen(at: number): string {
  const moment = new Date(at)
  return inIndia(moment).date === todayInIndia() ? `at ${formatTimeOf(moment)}` : `on ${formatWhen(moment)}`
}

// On every screen: sends what waits as soon as there is signal (when it comes back, when the app is
// opened again, and every 15 seconds while anything waits), in order, and says how it stands. A save
// the server turns down stays listed with its reason until he lets it go. A screen opened from the copy
// kept on the phone (no signal, public/sw.js) says when the copy is from until the fresh one is in.
export function OutboxSync() {
  const items = useOutbox()
  const online = useOnline()
  const router = useRouter()
  const sending = useRef(false)
  const [busy, setBusy] = useState(false)
  const copyAt = useSyncExternalStore(subscribeCopyAt, readCopyAt, () => null)
  const [refreshing, startRefresh] = useTransition()
  const replacing = useRef(false)

  // The screen gets its data from the server again; a copy on show is replaced once that is in
  const refreshScreen = useCallback(() => {
    replacing.current = true
    startRefresh(() => router.refresh())
  }, [router])
  useEffect(() => {
    if (!replacing.current || refreshing) return
    replacing.current = false
    copyReplaced()
  }, [refreshing])

  // A copy on show is replaced when the signal is back, or when the fresh screen arrives after it
  useEffect(() => {
    if (copyAt === null) return
    window.addEventListener('online', refreshScreen)
    const stop = onFreshCopy(refreshScreen)
    return () => {
      window.removeEventListener('online', refreshScreen)
      stop()
    }
  }, [copyAt, refreshScreen])

  // Another screen opened came from the server, so the note about the copy goes
  const pathname = usePathname()
  const firstPath = useRef(pathname)
  useEffect(() => {
    if (pathname !== firstPath.current) copyReplaced()
  }, [pathname])

  // A next visit changed with no signal after the patient had the WhatsApp: their message about it
  const [toTell, setToTell] = useState<string[]>([])

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
            const url = result?.whatsappUrl
            if (url) setToTell((t) => [...t, url])
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
    if (saved > 0) refreshScreen()
  }, [refreshScreen])

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
  if (online && waiting.length === 0 && failed.length === 0 && copyAt === null && toTell.length === 0) return null
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
      {copyAt !== null && (
        <p role="status" className="flex min-h-11 items-center gap-2 rounded-xl bg-gray-100 py-1 pr-1 pl-3 text-sm font-semibold text-gray-700">
          <History className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">Showing this screen as it was {keptWhen(copyAt)}</span>
          {online && (
            <button type="button" onClick={refreshScreen} disabled={refreshing} className="min-h-11 shrink-0 rounded-lg px-3 font-semibold disabled:opacity-60">
              {refreshing ? 'Updating…' : 'Update'}
            </button>
          )}
        </p>
      )}
      {toTell.map((url) => (
        <div key={url} role="status" className="flex items-center gap-2 rounded-xl bg-white py-1 pr-1 pl-3 text-sm text-gray-900 ring-1 ring-gray-200">
          <p className="min-w-0 flex-1 py-2">The next visit changed after the WhatsApp went: tell the patient.</p>
          <button type="button" onClick={() => { setToTell((t) => t.filter((u) => u !== url)); openWhatsApp(url) }}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 font-semibold">
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> Open WhatsApp
          </button>
        </div>
      ))}
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
