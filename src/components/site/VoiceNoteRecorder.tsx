'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, RotateCcw, Square, Trash2 } from 'lucide-react'

// A short recording on the booking page (up to a minute), so the patient can tell Dr. Rahil what is
// wrong in their own words. Kept small (about 24 kbit/s) so it uploads quickly on mobile data.
const MAX_SECONDS = 60
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

type State =
  | { kind: 'idle' }
  | { kind: 'recording'; seconds: number }
  | { kind: 'recorded'; url: string; seconds: number }
  | { kind: 'blocked' }

export function canRecordVoice(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function VoiceNoteRecorder({ onChange }: { onChange: (note: Blob | null) => void }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)
  const seconds = useRef(0)

  // Let go of the microphone and the recording's memory when the page goes away
  useEffect(
    () => () => {
      if (ticker.current) clearInterval(ticker.current)
      recorder.current?.stream.getTracks().forEach((t) => t.stop())
    },
    [],
  )
  const url = state.kind === 'recorded' ? state.url : null
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

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
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }
    rec.onstop = () => {
      if (ticker.current) clearInterval(ticker.current)
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks.current, { type: (rec.mimeType || 'audio/webm').split(';')[0] })
      if (blob.size === 0) {
        setState({ kind: 'idle' })
        return
      }
      setState({ kind: 'recorded', url: URL.createObjectURL(blob), seconds: seconds.current })
      onChange(blob)
    }
    recorder.current = rec
    rec.start()
    setState({ kind: 'recording', seconds: 0 })
    ticker.current = setInterval(() => {
      seconds.current += 1
      setState({ kind: 'recording', seconds: seconds.current })
      if (seconds.current >= MAX_SECONDS) rec.stop()
    }, 1000)
  }

  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  function remove() {
    onChange(null)
    setState({ kind: 'idle' })
  }

  const big = 'flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold'
  if (state.kind === 'blocked') {
    return (
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
        The microphone is blocked in this browser. You can write it in the note below instead.
      </p>
    )
  }
  if (state.kind === 'recording') {
    return (
      <button type="button" onClick={stop} className={`${big} bg-red-600 text-white`}>
        <Square className="h-5 w-5 fill-current" /> Stop ({clock(state.seconds)} of 1:00)
      </button>
    )
  }
  if (state.kind === 'recorded') {
    return (
      <div className="space-y-2">
        <audio src={state.url} controls className="w-full" aria-label="Your voice note" />
        <div className="flex gap-2">
          <button type="button" onClick={() => { remove(); void start() }}
            className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-semibold text-gray-700 ring-1 ring-gray-300">
            <RotateCcw className="h-4 w-4" /> Record again
          </button>
          <button type="button" onClick={remove}
            className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-semibold text-red-700 ring-1 ring-red-200">
            <Trash2 className="h-4 w-4" /> Remove
          </button>
        </div>
      </div>
    )
  }
  return (
    <button type="button" onClick={() => void start()} className={`${big} bg-blue-50 text-blue-800 ring-1 ring-blue-200`}>
      <Mic className="h-5 w-5" /> Tap to record (up to 1 minute)
    </button>
  )
}
