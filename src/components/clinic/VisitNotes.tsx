'use client'

import { useEffect, useImperativeHandle, useState, type Ref } from 'react'
import { AlertCircle, Check, CloudOff } from 'lucide-react'
import { saveVisitNotes } from '@/lib/actions/visits'
import type { NoteSuggestions } from '@/lib/actions/smart-notes'
import { RecordNotes } from './RecordNotes'

// What the visit page asks of the notes: save anything typed, now (before another button acts), and
// change the text from elsewhere on the page (the prescription card adds and removes medicines)
export type NotesHandle = { flush: () => Promise<void>; edit: (change: (text: string) => string) => void }

// Notes save by themselves this long after typing stops
const SAVE_AFTER_MS = 1500
// Without a connection, try again this often (and as soon as the phone is back online)
const RETRY_MS = 10_000

type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'failed'

// Unsaved notes are kept on the phone, so they survive no internet or Android closing the tab while
// the camera is open. Storage can be unavailable (private mode), so never throw: a read gives
// undefined and a write gives false when storage can't be used.
function readDraft(key: string): string | null | undefined {
  try {
    return localStorage.getItem(key)
  } catch {
    return undefined
  }
}
function writeDraft(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    return true
  } catch {
    // Not critical: the draft is only a safety net
    return false
  }
}

// Saves the notes in the background: shortly after typing stops, at once when asked (flush),
// one save at a time, and again after a lost connection. Saves don't refresh other screens, except
// the first note on an empty visit (so it starts being listed) and the save when the doctor leaves
// the page or switches app (so Today shows the latest).
//
// The on-phone draft is the newest text. A copy of this page left behind (its retry timer still
// running after the doctor reopened the visit and typed more) must never save older text over newer,
// so every save sends the draft, and the draft is cleared only while it still equals what was saved.
function createNotesSaver(visitId: string, initial: string, listed: boolean, report: (state: SaveState) => void) {
  const draftKey = `visit-draft:${visitId}`
  let latest = initial // what is in the box now
  let saved = initial // what the server has
  let timer: ReturnType<typeof setTimeout> | null = null
  let inflight: Promise<void> | null = null
  let needsListing = !listed && !initial.trim()
  let unrefreshed = false // saved, but other screens don't know yet
  let wantRefresh = false // leaving: refresh other screens with the next save
  let storageWorks = true // false once the phone refused to keep a draft: then the box is the newest text
  let refused = false // the server said no: stop trying until the doctor types again

  // The newest text: the draft on the phone (empty: nothing unsaved anywhere), else the box
  const newest = (): string => {
    if (!storageWorks) return latest
    const draft = readDraft(draftKey)
    if (draft === undefined) return latest
    return draft ?? saved
  }

  const later = (ms: number) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush(), ms)
  }

  async function flush(options: { leaving?: boolean } = {}): Promise<void> {
    if (options.leaving) wantRefresh = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    while (inflight) await inflight
    const text = newest()
    const changed = text !== saved
    if (!changed && !(wantRefresh && unrefreshed)) return
    const refresh = wantRefresh || (needsListing && !!text.trim())

    inflight = (async () => {
      if (changed) report('saving')
      let result: { error?: string }
      try {
        if (navigator.onLine === false) throw new Error('offline')
        result = await saveVisitNotes(visitId, text, { refresh })
      } catch {
        // The request never got an answer: kept on the phone, tried again shortly
        if (changed) report('offline')
        later(RETRY_MS)
        return
      }
      if (result.error) {
        // The server answered no (for example, the visit was deleted): trying again won't help
        refused = true
        if (changed) report('failed')
        return
      }
      saved = text
      if (refresh) {
        unrefreshed = false
        wantRefresh = false
        if (text.trim()) needsListing = false
      } else {
        unrefreshed = true
      }
      // Clear the draft only if nothing newer was typed meanwhile (here or in another copy)
      if (readDraft(draftKey) === text) writeDraft(draftKey, null)
      if (changed && latest === text) report('saved')
    })()
    try {
      await inflight
    } finally {
      inflight = null
    }
    // More was typed while saving
    if (!refused && newest() !== saved && !timer) later(SAVE_AFTER_MS)
  }

  return {
    latest: () => latest,
    change(text: string) {
      latest = text
      refused = false
      if (!writeDraft(draftKey, text === saved ? null : text)) storageWorks = false
      later(SAVE_AFTER_MS)
    },
    // Notes typed earlier that never reached the server (null if none); saved now
    restore(): string | null {
      const draft = readDraft(draftKey)
      if (draft === null || draft === undefined || draft === saved) return null
      latest = draft
      void flush()
      return draft
    },
    flush,
  }
}

export function VisitNotes({
  visitId,
  initialNotes,
  listed,
  handle,
  onSuggestions,
  onText,
}: {
  visitId: string
  initialNotes: string
  // The visit already has photos, charges or payments, so it is listed on Today and the patient page
  listed: boolean
  handle?: Ref<NotesHandle>
  // The charges and next visit Gemini suggested from a recording
  onSuggestions?: (suggestions: NoteSuggestions) => void
  // The text as it changes (the prescription card reads the medicines from it)
  onText?: (text: string) => void
}) {
  const [notes, setNotes] = useState(initialNotes)
  const [state, setState] = useState<SaveState>('idle')
  const [saver] = useState(() => createNotesSaver(visitId, initialNotes, listed, setState))

  const change = (next: string) => {
    setNotes(next)
    onText?.(next)
    setState((s) => (s === 'offline' ? s : 'idle'))
    saver.change(next)
  }

  useImperativeHandle(handle, () => ({ flush: () => saver.flush(), edit: (fn) => change(fn(saver.latest())) }))

  // Bring back notes that never reached the server
  useEffect(() => {
    const draft = saver.restore()
    if (draft !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the draft lives in browser storage, only readable after mount
      setNotes(draft)
      onText?.(draft)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on opening the visit
  }, [saver])

  // Save at once when the doctor switches app (camera, WhatsApp) or leaves the page,
  // and as soon as the connection comes back
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saver.flush({ leaving: true })
    }
    const onOnline = () => void saver.flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('online', onOnline)
      void saver.flush({ leaving: true })
    }
  }, [saver])

  return (
    <section className="space-y-2">
      <label htmlFor="notes" className="block text-lg font-bold text-gray-900">Notes</label>
      <RecordNotes visitId={visitId} onSorted={(result) => {
        // Added below anything already typed; he can edit it like any note
        const current = saver.latest()
        if (result.notes) change(current.trim() ? `${current.replace(/\s+$/, '')}\n\n${result.notes}` : result.notes)
        onSuggestions?.(result)
      }} />
      <textarea id="notes" rows={8} value={notes} onChange={(e) => change(e.target.value)}
        placeholder="Complaint, findings, treatment done, plan, medicines…"
        className="block w-full rounded-xl border-0 px-4 py-3 text-base leading-relaxed text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600" />
      <p className="min-h-5 text-sm" aria-live="polite">
        {state === 'saving' && <span className="text-gray-500">Saving…</span>}
        {state === 'saved' && (
          <span className="inline-flex items-center gap-1 text-green-700"><Check className="h-4 w-4" /> Saved</span>
        )}
        {state === 'offline' && (
          <span className="inline-flex items-start gap-1.5 text-amber-800">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
            No internet. The note is kept on this phone and saves when the connection is back.
          </span>
        )}
        {state === 'failed' && (
          <span className="inline-flex items-start gap-1.5 text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Couldn&apos;t save the note. It is kept on this phone.
          </span>
        )}
      </p>
    </section>
  )
}
