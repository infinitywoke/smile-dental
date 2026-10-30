'use client'

import { siteConfig } from '@/config/site'
import { Mic, RotateCcw, Square, Trash2 } from 'lucide-react'
import { clock, useVoiceRecorder } from '@/components/site/voice-recorder'

// The booking card's voice note: up to a minute in the patient's own words, heard back before sending
export function VoiceNote({ onChange }: { onChange: (note: Blob | null) => void }) {
  const { state, start, stop, remove } = useVoiceRecorder(onChange)

  if (state.kind === 'blocked') {
    return <p className="h-note">The microphone is blocked in this browser. You can send {siteConfig.dentist.short} a voice note on WhatsApp after you tap Send instead.</p>
  }
  if (state.kind === 'recording') {
    return (
      <button type="button" className="h-voice-btn recording" onClick={stop}>
        <Square className="h-icon" aria-hidden="true" /> Stop ({clock(state.seconds)} of 1:00)
      </button>
    )
  }
  if (state.kind === 'recorded') {
    return (
      <div className="h-voice-done">
        <audio src={state.url} controls aria-label="Your voice note" />
        <div className="h-row">
          <button type="button" className="h-chip h-chip-icon" onClick={() => { remove(); void start() }}>
            <RotateCcw className="h-icon-sm" aria-hidden="true" /> Record again
          </button>
          <button type="button" className="h-chip h-chip-icon" onClick={remove}>
            <Trash2 className="h-icon-sm" aria-hidden="true" /> Remove
          </button>
        </div>
      </div>
    )
  }
  return (
    <button type="button" className="h-voice-btn" onClick={() => void start()}>
      <Mic className="h-icon" aria-hidden="true" /> Tap to record (up to 1 minute)
    </button>
  )
}
