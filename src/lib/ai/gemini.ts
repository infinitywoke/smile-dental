import 'server-only'
import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { formatZodError } from './zod-error'
import type { StructuredResult } from './claude'

// Live summaries. Model IDs are from ai.google.dev/gemini-api/docs/models.
export const GEMINI_MODEL = 'gemini-3.8-flash'

// A server function may run for a minute; one slow answer must leave room for the retry message
const REQUEST_TIMEOUT_MS = 40_000

let client: GoogleGenAI | null = null

// One client per server instance, created on first use so builds work without the key
export function getGemini(): GoogleGenAI {
  if (client) return client
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set — add it in Vercel and .env.local')
  client = new GoogleGenAI({ apiKey })
  return client
}

type JsonSchema = { [key: string]: unknown }

// Keywords Gemini's structured output may reject. Zod still enforces every one of them on the reply,
// so dropping them from what is sent only loses a hint, never a check.
const UNSUPPORTED = ['$schema', 'pattern', 'format', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength']

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip)
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as JsonSchema)
        .filter(([key]) => !UNSUPPORTED.includes(key))
        .map(([key, value]) => [key, strip(value)]),
    )
  }
  return node
}

// The JSON Schema sent to Gemini for a Zod schema
export function geminiSchema(schema: z.ZodType): JsonSchema {
  return strip(z.toJSONSchema(schema)) as JsonSchema
}

export type GeminiOptions<T extends z.ZodType> = {
  system: string
  content: string
  schema: T
  maxTokens?: number
}

// One Gemini call whose answer must match `schema`. Never throws: failures come back as
// { ok: false, error } with a message that's safe to show. An answer that doesn't match the
// schema is asked for once more before giving up.
export async function generateStructuredGemini<T extends z.ZodType>({
  system,
  content,
  schema,
  maxTokens = 8_000,
}: GeminiOptions<T>): Promise<StructuredResult<z.infer<T>>> {
  const jsonSchema = geminiSchema(schema)
  let lastProblem = ''

  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string
    let model: string
    try {
      const interaction = await getGemini().interactions.create({
        model: GEMINI_MODEL,
        input: content,
        system_instruction: system,
        // Nothing is kept on Google's side for later retrieval
        store: false,
        generation_config: { thinking_level: 'low', max_output_tokens: maxTokens },
        response_format: { type: 'text', mime_type: 'application/json', schema: jsonSchema },
      }, { timeout_ms: REQUEST_TIMEOUT_MS })
      if (interaction.status && interaction.status !== 'completed') {
        return { ok: false, error: 'Gemini did not finish the answer. Try again.', retryable: true }
      }
      text = (interaction.output_text ?? '').trim()
      model = interaction.model ?? GEMINI_MODEL
    } catch (error) {
      return failure(error)
    }

    if (!text) {
      lastProblem = 'Gemini returned an empty answer. Try again.'
      continue
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      lastProblem = "Gemini's answer wasn't valid JSON. Try again."
      continue
    }
    const parsed = schema.safeParse(json)
    if (parsed.success) {
      return { ok: true, data: parsed.data, model }
    }
    lastProblem = `Gemini's answer didn't match the expected format: ${formatZodError(parsed.error)}`
  }
  return { ok: false, error: lastProblem, retryable: true }
}

// Messages never include the API key
function failure(error: unknown): { ok: false; error: string; retryable: boolean } {
  const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : null
  const message = error instanceof Error ? error.message : ''
  if (status === 401 || status === 403 || /api key/i.test(message)) {
    return { ok: false, error: 'Gemini rejected the API key. Check GEMINI_API_KEY in Vercel and .env.local.', retryable: false }
  }
  if (status === 429) {
    return { ok: false, error: 'Gemini is busy (free-tier limit reached). Wait a minute and try again.', retryable: true }
  }
  if (status !== null && status >= 500) {
    return { ok: false, error: 'Gemini is having trouble right now. Try again in a minute.', retryable: true }
  }
  if (status === 400) {
    return { ok: false, error: 'Gemini rejected the request. Try again, or shorten the note.', retryable: false }
  }
  if (/timeout|fetch failed|network|ECONN|ENOTFOUND/i.test(message)) {
    return { ok: false, error: "Couldn't reach Gemini. Check the internet connection and try again.", retryable: true }
  }
  return { ok: false, error: 'Gemini could not tidy the note. Try again.', retryable: true }
}
