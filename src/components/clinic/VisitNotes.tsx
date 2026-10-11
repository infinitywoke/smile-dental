'use client'

import { useEffect, useImperativeHandle, useState, type Ref } from 'react'
import { Check, CloudOff } from 'lucide-react'
import { saveVisitNotes } from '@/lib/actions/visits'
import { appendDictation } from '@/lib/dictation'
import { MicButton } from './MicButton'

// What the visit page asks of the notes: save anything typed, now (before another button acts)
export type NotesHandle = { flush: () => Promise<void> }

// Notes save by themselves this long after typing stops
const SAVE_AFTER_MS = 1500
// Without a connection, try again this often (and as soon as the phone is back online)
const RETRY_MS = 10_000

type SaveState = 'idle' | 'saving' | 'saved' | 'offline'

// Unsaved notes are kept on the phone, so they survive no internet or Android closing the tab while
// the camera is open. Storage can be unavailable (private mode), so never throw.
function readDraft(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeDraft(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Not critical: the draft is only a safety net
  }
}

// Saves the notes in the background: shortly after typing stops, at once when asked (flush),
// one save at a time, and again after a failure. The on-phone draft is cleared once saved.
// Saves don't refresh other screens, except the first note on an empty visit (so it starts being
// listed) and the save when the doctor leaves the page or switches app (so Today shows the latest).
function createNotesSaver(visitId: string, initial: string, listed: boolean, report: (state: SaveState) => void) {
  const draftKey = `visit-draft:${visitId}`
  let latest = initial // what is in the box now
  let saved = initial // what the server has
  let timer: ReturnType<typeof setTimeout> | null = null
  let inflight: Promise<void> | null = null
  let needsListing = !listed && !initial.trim()
  let unrefreshed = false // saved, but other screens don't know yet
  let wantRefresh = false // leaving: refresh other screens with the next save

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
    const text = latest
    const changed = text !== saved
    if (!changed && !(wantRefresh && unrefreshed)) return
    const refresh = wantRefresh || (needsListing && !!text.trim())

    inflight = (async () => {
      if (changed) report('saving')
      try {
        if (navigator.onLine === false) throw new Error('offline')
        const result = await saveVisitNotes(visitId, text, { refresh })
        if (result.error) throw new Error(result.error)
        saved = text
        if (refresh) {
          unrefreshed = false
          wantRefresh = false
          if (text.trim()) needsListing = false
        } else {
          unrefreshed = true
        }
        if (changed && latest === text) {
          writeDraft(draftKey, null)
          report('saved')
        }
      } catch {
        // Kept on the phone; tried again shortly
        if (changed) report('offline')
        later(RETRY_MS)
      }
    })()
    try {
      await inflight
    } finally {
      inflight = null
    }
    // More was typed while saving
    if (latest !== saved && !timer) later(SAVE_AFTER_MS)
  }

  return {
    latest: () => latest,
    change(text: string) {
      latest = text
      writeDraft(draftKey, text === saved ? null : text)
      later(SAVE_AFTER_MS)
    },
    // Notes typed earlier that never reached the server (null if none); saved now
    restore(): string | null {
      const draft = readDraft(draftKey)
      if (draft === null || draft === saved) return null
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
}: {
  visitId: string
  initialNotes: string
  // The visit already has photos, charges or payments, so it is listed on Today and the patient page
  listed: boolean
  handle?: Ref<NotesHandle>
}) {
  const [notes, setNotes] = useState(initialNotes)
  const [state, setState] = useState<SaveState>('idle')
  const [hearing, setHearing] = useState('')
  const [listening, setListening] = useState(false)
  const [saver] = useState(() => createNotesSaver(visitId, initialNotes, listed, setState))

  useImperativeHandle(handle, () => ({ flush: () => saver.flush() }), [saver])

  const change = (next: string) => {
    setNotes(next)
    setState((s) => (s === 'offline' ? s : 'idle'))
    saver.change(next)
  }

  // Bring back notes that never reached the server
  useEffect(() => {
    const draft = saver.restore()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the draft lives in browser storage, only readable after mount
    if (draft !== null) setNotes(draft)
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
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="notes" className="text-lg font-bold text-gray-900">Notes</label>
        <MicButton onText={(t) => change(appendDictation(saver.latest(), t))} onInterim={setHearing} onListeningChange={setListening} />
      </div>
      {listening && (
        <p className="min-h-10 rounded-lg bg-blue-50 px-3 py-2 text-base italic text-blue-900" aria-live="polite">
          {hearing ? `${hearing}…` : 'Listening…'}
          <span className="mt-1 block text-sm not-italic text-blue-700">You do not need to say the patient&apos;s name.</span>
        </p>
      )}
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
      </p>
    </section>
  )
}
