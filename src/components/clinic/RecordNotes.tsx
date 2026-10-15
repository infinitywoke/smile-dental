'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, Mic, Pause, Play, RotateCcw, Square } from 'lucide-react'
import { sortVisitNotes, type NoteSuggestions } from '@/lib/actions/smart-notes'

// Record the visit's notes (talk freely, pause, stop), then Gemini writes them out and sorts them.
// The recording stays on this phone until the notes are in, so a busy moment can be tried again.
const MAX_SECONDS = 10 * 60
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

type State =
  | { kind: 'idle' }
  | { kind: 'recording'; seconds: number; paused: boolean }
  | { kind: 'sorting' }
  | { kind: 'failed'; message: string; canRetry: boolean }
  | { kind: 'blocked' }

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function RecordNotes({ visitId, onSorted }: { visitId: string; onSorted: (result: NoteSuggestions) => void }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)
  const seconds = useRef(0)
  const kept = useRef<Blob | null>(null)

  useEffect(
    () => () => {
      if (ticker.current) clearInterval(ticker.current)
      recorder.current?.stream.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  async function sort(blob: Blob) {
    setState({ kind: 'sorting' })
    const form = new FormData()
    form.set('visitId', visitId)
    form.set('audio', blob)
    try {
      const reply = await sortVisitNotes(form)
      if (reply.error || !reply.result) {
        setState({ kind: 'failed', message: reply.error ?? "Couldn't sort the notes. Tap Try again.", canRetry: true })
        return
      }
      kept.current = null
      setState({ kind: 'idle' })
      onSorted(reply.result)
    } catch {
      setState({ kind: 'failed', message: "Couldn't reach the server. Check the internet and tap Try again.", canRetry: true })
    }
  }

  async function start() {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setState({ kind: 'blocked' })
      return
    }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24_000 })
    chunks.current = []
    seconds.current = 0
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data)
    }
    rec.onstop = () => {
      if (ticker.current) clearInterval(ticker.current)
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks.current, { type: (rec.mimeType || 'audio/webm').split(';')[0] })
      if (blob.size === 0) {
        setState({ kind: 'idle' })
        return
      }
      kept.current = blob
      void sort(blob)
    }
    recorder.current = rec
    rec.start()
    setState({ kind: 'recording', seconds: 0, paused: false })
    ticker.current = setInterval(() => {
      if (rec.state !== 'recording') return
      seconds.current += 1
      setState({ kind: 'recording', seconds: seconds.current, paused: false })
      if (seconds.current >= MAX_SECONDS) rec.stop()
    }, 1000)
  }

  function pauseOrResume() {
    const rec = recorder.current
    if (!rec) return
    if (rec.state === 'recording') {
      rec.pause()
      setState({ kind: 'recording', seconds: seconds.current, paused: true })
    } else if (rec.state === 'paused') {
      rec.resume()
      setState({ kind: 'recording', seconds: seconds.current, paused: false })
    }
  }

  const button = 'flex min-h-12 items-center justify-center gap-1.5 rounded-full px-4 text-base font-semibold'
  if (state.kind === 'recording') {
    return (
      <div className="space-y-2 rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
        <p className="text-sm font-semibold text-red-800" aria-live="polite">
          {state.paused ? 'Paused' : 'Recording'} · {clock(state.seconds)}
          <span className="block font-normal text-red-700">🔒 Don&apos;t say the patient&apos;s name or number.</span>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={pauseOrResume} className={`${button} flex-1 bg-white text-red-800 ring-1 ring-red-200`}>
            {state.paused ? <><Play className="h-5 w-5" /> Resume</> : <><Pause className="h-5 w-5" /> Pause</>}
          </button>
          <button type="button" onClick={() => recorder.current?.stop()} className={`${button} flex-1 bg-red-600 text-white`}>
            <Square className="h-4 w-4 fill-current" /> Stop
          </button>
        </div>
      </div>
    )
  }
  if (state.kind === 'sorting') {
    return (
      <p className="flex min-h-12 items-center gap-2 rounded-2xl bg-blue-50 px-4 text-base font-semibold text-blue-800" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin" /> Sorting your notes…
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => void start()} className={`${button} bg-blue-50 text-blue-700 ring-1 ring-blue-200`}>
        <Mic className="h-5 w-5" /> Record notes
      </button>
      {state.kind === 'blocked' && (
        <p className="text-sm text-amber-800">The microphone is blocked. Allow it in Chrome&apos;s site settings, or type the notes.</p>
      )}
      {state.kind === 'failed' && (
        <div className="space-y-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          <p className="flex items-start gap-1.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {state.message}</p>
          {state.canRetry && (
            <button type="button" onClick={() => kept.current && void sort(kept.current)}
              className={`${button} bg-white text-red-800 ring-1 ring-red-200`}>
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
          )}
        </div>
      )}
    </div>
  )
}
