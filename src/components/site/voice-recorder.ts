import { useEffect, useRef, useState } from 'react'

// A short recording with the booking (up to a minute), so the patient can tell Dr. Rahil what is wrong
// in their own words. Kept small (about 24 kbit/s) so it uploads quickly on mobile data.
const MAX_SECONDS = 60
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export type VoiceState =
  | { kind: 'idle' }
  | { kind: 'recording'; seconds: number }
  | { kind: 'recorded'; url: string; seconds: number }
  | { kind: 'blocked' }

export function canRecordVoice(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// The recorder itself, whatever it looks like: what it is doing, and start, stop and remove
export function useVoiceRecorder(onChange: (note: Blob | null) => void) {
  const [state, setState] = useState<VoiceState>({ kind: 'idle' })
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

  return { state, start, stop, remove }
}
