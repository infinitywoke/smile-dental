import { GoogleGenAI, type Session } from '@google/genai'
import { LIVE_TRANSCRIBE_CONFIG, LIVE_TRANSCRIBE_MODEL } from './live-transcribe-config'

// Live dictation in the browser: the microphone is streamed from the moment the button is pressed
// until it is pressed again, to Gemini's live transcription model, and the words come back as they
// are spoken. Audio goes straight from the phone to Google over a one-use token (see
// actions/transcribe.ts); the server never handles it.

const SAMPLE_RATE = 16_000
// About 100 ms of audio per message, as the Live API recommends
const CHUNK_SAMPLES = 1_600
// A live session lasts 10 minutes at most, so a new one is opened a little before that
const SESSION_MS = 9 * 60 * 1000

// Runs in the audio thread: turns the microphone's float samples into 16 kHz, 16-bit chunks
const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / ${SAMPLE_RATE}
    this.position = 0
    this.chunk = new Int16Array(${CHUNK_SAMPLES})
    this.filled = 0
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    // The context normally runs at 16 kHz already; if the browser ignored that, pick samples at the right spacing
    while (this.position < channel.length) {
      const sample = Math.max(-1, Math.min(1, channel[Math.floor(this.position)]))
      this.chunk[this.filled++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      this.position += this.ratio
      if (this.filled === this.chunk.length) {
        this.port.postMessage(this.chunk.buffer, [this.chunk.buffer])
        this.chunk = new Int16Array(${CHUNK_SAMPLES})
        this.filled = 0
      }
    }
    this.position -= channel.length
    return true
  }
}
registerProcessor('pcm-capture', PcmCapture)
`

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export type LiveTranscriber = {
  // Ends the stream, waits briefly for the last words, then releases the microphone
  stop: () => Promise<void>
}

export type LiveHandlers = {
  getToken: () => Promise<{ token?: string; error?: string }>
  // A finished phrase
  onFinal: (text: string) => void
  // Words being heard right now
  onInterim: (text: string) => void
  // Something went wrong and the stream has stopped; the message is safe to show
  onError: (message: string) => void
}

export class LiveStartError extends Error {
  // 'denied' = the microphone is blocked; 'unavailable' = the service could not start (fall back to browser dictation)
  constructor(message: string, readonly kind: 'denied' | 'unavailable') {
    super(message)
  }
}

export async function startLiveTranscription(handlers: LiveHandlers): Promise<LiveTranscriber> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
    throw new LiveStartError('This browser cannot stream the microphone.', 'unavailable')
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
  } catch (error) {
    const name = (error as { name?: string }).name
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new LiveStartError('Microphone access is blocked. Allow the microphone for this site in the browser settings.', 'denied')
    }
    throw new LiveStartError('No microphone found. Check that a microphone is connected.', 'unavailable')
  }

  const releaseMic = (context?: AudioContext) => {
    stream.getTracks().forEach((track) => track.stop())
    context?.close().catch(() => {})
  }

  let session: Session | null = null
  let stopped = false
  let rotateTimer: ReturnType<typeof setTimeout> | undefined
  let finishWaiter: (() => void) | null = null
  // The words of the phrase in progress: the service sends the finished phrase when the speaker
  // pauses, so if the stream ends first, these are delivered instead of being lost
  let heard = ''

  async function openSession(): Promise<Session> {
    const { token, error } = await handlers.getToken()
    if (!token) throw new LiveStartError(error ?? 'Live dictation could not start.', 'unavailable')
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } })
    // Lets a session's callbacks tell whether it is still the one in use (not one being replaced)
    const mine: { session: Session | null } = { session: null }
    mine.session = await ai.live.connect({
      model: LIVE_TRANSCRIBE_MODEL,
      // The same configuration the token was locked to
      config: LIVE_TRANSCRIBE_CONFIG as never,
      callbacks: {
        onmessage: (message) => {
          const content = message.serverContent
          if (!content) return
          const interim = (content as { interimInputTranscription?: { text?: string } }).interimInputTranscription?.text
          if (interim) {
            heard = interim.trim()
            handlers.onInterim(heard)
          }
          const final = (content as { inputTranscription?: { text?: string } }).inputTranscription?.text
          if (final && final.trim()) {
            heard = ''
            handlers.onInterim('')
            handlers.onFinal(final.trim())
            finishWaiter?.()
          }
        },
        onerror: () => {
          if (!stopped && session === mine.session) fail('Live dictation lost its connection. Tap Dictate to continue.')
        },
        onclose: () => {
          // A session that ends by itself (not by rotation or Stop) is replaced; if that fails, say so
          if (!stopped && session === mine.session) void rotate()
        },
      },
    })
    return mine.session
  }

  function flushHeard() {
    if (heard) handlers.onFinal(heard)
    heard = ''
  }

  function fail(message: string) {
    if (stopped) return
    stopped = true
    clearTimeout(rotateTimer)
    flushHeard()
    handlers.onInterim('')
    handlers.onError(message)
    session?.close()
    releaseMic(context)
  }

  async function rotate() {
    if (stopped) return
    try {
      const next = await openSession()
      const previous = session
      session = next
      clearTimeout(rotateTimer)
      rotateTimer = setTimeout(() => void rotate(), SESSION_MS)
      // Let the old session finish what it is hearing before it is closed
      setTimeout(() => previous?.close(), 1500)
    } catch {
      fail('Live dictation could not reconnect. Tap Dictate to continue.')
    }
  }

  const context = new AudioContext({ sampleRate: SAMPLE_RATE })
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    try {
      await context.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }
    session = await openSession()
  } catch (error) {
    releaseMic(context)
    if (error instanceof LiveStartError) throw error
    throw new LiveStartError('Live dictation could not start.', 'unavailable')
  }

  const source = context.createMediaStreamSource(stream)
  const capture = new AudioWorkletNode(context, 'pcm-capture')
  capture.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    if (stopped || !session) return
    try {
      session.sendRealtimeInput({ audio: { data: toBase64(event.data), mimeType: `audio/pcm;rate=${SAMPLE_RATE}` } })
    } catch {
      // A chunk lost while a session is being replaced is only a fraction of a second
    }
  }
  source.connect(capture)
  rotateTimer = setTimeout(() => void rotate(), SESSION_MS)

  return {
    stop: async () => {
      if (stopped) return
      // Stop sending, tell the service the audio has ended, and give it a moment to deliver the last words
      stopped = true
      clearTimeout(rotateTimer)
      source.disconnect()
      capture.port.onmessage = null
      try {
        session?.sendRealtimeInput({ audioStreamEnd: true })
        await new Promise<void>((resolve) => {
          finishWaiter = resolve
          setTimeout(resolve, 2500)
        })
      } catch {
        // Nothing more to deliver
      }
      flushHeard()
      handlers.onInterim('')
      session?.close()
      releaseMic(context)
    },
  }
}
