'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'

// Minimal typing for the browser Web Speech API (Chrome exposes it as webkitSpeechRecognition)
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}

type WakeLock = { release(): Promise<void> }

// What each browser speech error means, in plain words
const DICTATION_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow the microphone for this site in the browser settings.',
  'service-not-allowed': 'This browser does not allow dictation. Use Chrome, or the mic on the phone keyboard.',
  'audio-capture': 'No microphone found. Check that a microphone is connected.',
  network: 'Dictation could not reach the speech service. Check the internet, or use the mic on the phone keyboard.',
  'language-not-supported': 'English (India) dictation is not available in this browser.',
}

function getRecognitionClass(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

type Props = {
  onText: (text: string) => void        // each finished phrase
  onInterim?: (text: string) => void    // words being heard right now ('' when none)
}

// Tap to start dictating; stays on until Stop is tapped.
// Browsers end recognition after each pause, so it restarts itself until stopped.
export function MicButton({ onText, onInterim }: Props) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const wantListeningRef = useRef(false)
  const wakeLockRef = useRef<WakeLock | null>(null)
  const callbacksRef = useRef({ onText, onInterim })

  useEffect(() => {
    callbacksRef.current = { onText, onInterim }
  }, [onText, onInterim])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser support is only known after mount
    setSupported(getRecognitionClass() !== null)
    return () => {
      wantListeningRef.current = false
      recognitionRef.current?.abort()
      wakeLockRef.current?.release().catch(() => {})
    }
  }, [])

  if (!supported) return null

  const releaseWakeLock = () => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }

  const finish = (message: string | null = null) => {
    wantListeningRef.current = false
    recognitionRef.current = null
    releaseWakeLock()
    callbacksRef.current.onInterim?.('')
    setListening(false)
    setError(message)
  }

  const listen = () => {
    const RecognitionClass = getRecognitionClass()
    if (!RecognitionClass) return
    const recognition = new RecognitionClass()
    recognition.lang = 'en-IN'
    // One phrase per session, restarted on end: avoids Android Chrome repeating text in continuous mode
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript.trim()
        if (result.isFinal) {
          if (text) callbacksRef.current.onText(text)
        } else {
          interim += `${text} `
        }
      }
      callbacksRef.current.onInterim?.(interim.trim())
    }
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      finish(DICTATION_ERRORS[event.error] ?? `Dictation stopped (${event.error}). Tap the mic to try again.`)
    }
    recognition.onend = () => {
      callbacksRef.current.onInterim?.('')
      if (wantListeningRef.current && recognitionRef.current === recognition) {
        // Keep going until the doctor taps Stop
        try {
          recognition.start()
        } catch {
          setTimeout(() => wantListeningRef.current && listen(), 250)
        }
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const start = async () => {
    setError(null)
    wantListeningRef.current = true
    setListening(true)
    listen()
    // Keep the screen awake while dictating, so the phone doesn't sleep mid-sentence
    try {
      const wakeLock = (navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<WakeLock> } }).wakeLock
      if (wakeLock) wakeLockRef.current = await wakeLock.request('screen')
    } catch {
      // Not supported or not allowed; dictation still works
    }
  }

  const stop = () => {
    const recognition = recognitionRef.current
    finish()
    recognition?.stop()
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-pressed={listening}
        className={`relative isolate inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
          listening ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
        }`}
      >
        {listening && <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-red-400 opacity-60" aria-hidden="true" />}
        {listening ? (
          <>
            <span className="flex h-4 items-center gap-0.5" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="mic-bar h-4 w-1 rounded-full bg-white" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </span>
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" />
            Dictate
          </>
        )}
      </button>
      {error && <span className="max-w-64 text-right text-xs text-red-600">{error}</span>}
    </span>
  )
}
