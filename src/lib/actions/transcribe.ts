'use server'

import { GoogleGenAI } from '@google/genai'
import { getDoctor } from '@/lib/auth'
import { LIVE_TRANSCRIBE_CONFIG, LIVE_TRANSCRIBE_MODEL } from '@/lib/live-transcribe-config'

// A one-use token for the browser to open the live transcription stream. The real API key never
// leaves the server; the token only works for this model and this configuration, for 30 minutes,
// and a new session must start within one minute of it being made.
export async function createTranscribeToken(): Promise<{ token?: string; error?: string }> {
  await getDoctor()
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { error: 'Live dictation is not set up.' }

  try {
    const client = new GoogleGenAI({ apiKey })
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: { model: LIVE_TRANSCRIBE_MODEL, config: LIVE_TRANSCRIBE_CONFIG as never },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    })
    if (!token.name) return { error: 'Live dictation could not start.' }
    return { token: token.name }
  } catch {
    return { error: 'Live dictation could not start.' }
  }
}
