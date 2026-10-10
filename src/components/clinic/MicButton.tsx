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
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}

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

// Tap to dictate; each finished sentence is passed to onText.
export function MicButton({ onText, label = 'Dictate' }: { onText: (text: string) => void; label?: string }) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const onTextRef = useRef(onText)

  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser support is only known after mount
    setSupported(getRecognitionClass() !== null)
    return () => recognitionRef.current?.stop()
  }, [])

  if (!supported) return null

  const start = () => {
    const RecognitionClass = getRecognitionClass()
    if (!RecognitionClass) return
    const recognition = new RecognitionClass()
    recognition.lang = 'en-IN'
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) onTextRef.current(result[0].transcript.trim())
      }
    }
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      setError(DICTATION_ERRORS[event.error] ?? `Dictation stopped (${event.error}). Tap the mic to try again.`)
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    setError(null)
    setListening(true)
    recognition.start()
  }

  const stop = () => recognitionRef.current?.stop()

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={listening ? stop : start}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
          listening ? 'bg-red-600 text-white animate-pulse' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
        }`}
        aria-pressed={listening}
      >
        {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        {listening ? 'Stop' : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}

// Appends dictated text to existing notes as a new sentence
export function appendDictation(current: string, addition: string): string {
  if (!addition) return current
  const capitalised = addition.charAt(0).toUpperCase() + addition.slice(1)
  if (!current.trim()) return capitalised
  const separator = /[.!?\n]\s*$/.test(current) ? ' ' : '. '
  return current.replace(/\s+$/, '') + separator + capitalised
}
