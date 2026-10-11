import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { z } from 'zod'
import { structuredOutputFormat } from './output-format'
import { formatZodError } from './zod-error'

// The cheapest model that does the job (owner decision 2026-10-10, about ₹0.1 per visit).
// Move up to 'claude-sonnet-5-5' only if the evaluation set shows Haiku falls short.
export const CLAUDE_MODEL = 'claude-haiku-5-5'

let client: Anthropic | null = null

// One client per server instance, created on first use so builds work without the key
export function getClaude(): Anthropic {
  if (client) return client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set — add it in Vercel and .env.local')
  // One retry and a 2-minute timeout keep the worst case inside a server function's time limit
  client = new Anthropic({ apiKey, maxRetries: 1, timeout: 120_000 })
  return client
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type StructuredResult<T> =
  | { ok: true; data: T; model: string; usage?: Anthropic.Beta.BetaUsage }
  | { ok: false; error: string; retryable: boolean }

export type GenerateStructuredOptions<T extends z.ZodType> = {
  // Keep it identical between calls (no dates, names or IDs) so it's served from the prompt cache
  system: string
  // The note text, or text + image blocks (e.g. a prescription photo)
  content: string | Anthropic.Beta.BetaContentBlockParam[]
  schema: T
  // Thinking depth and token spend; 'medium' is the model's default.
  effort?: Effort
  maxTokens?: number
}

// One Claude call whose answer must match `schema`. Never throws: failures come back as
// { ok: false, error } with a message that's safe to show, and whether trying again may help.
export async function generateStructured<T extends z.ZodType>({
  system,
  content,
  schema,
  effort = 'medium',
  maxTokens = 16_000,
}: GenerateStructuredOptions<T>): Promise<StructuredResult<z.infer<T>>> {
  const format = structuredOutputFormat(schema)

  let response: Anthropic.Beta.BetaMessage
  try {
    response = await getClaude().beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
      output_config: { effort, format },
    })
  } catch (error) {
    return failure(error)
  }

  // Check why it stopped before reading the content: a refused or cut-off answer isn't valid JSON
  if (response.stop_reason === 'refusal') {
    const category = response.stop_details?.category
    return {
      ok: false,
      error: `Claude declined this request${category ? ` (${category})` : ''}. Edit the note and try again, or fill the summary in by hand.`,
      retryable: false,
    }
  }
  if (response.stop_reason === 'max_tokens' || response.stop_reason === 'model_context_window_exceeded') {
    return { ok: false, error: 'Claude ran out of room before finishing the answer. Try a shorter note.', retryable: false }
  }

  const text = answerText(response.content)
  if (!text) return { ok: false, error: 'Claude returned an empty answer. Try again.', retryable: true }

  // Validated here rather than with format.parse(), whose errors are a raw JSON dump
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: "Claude's answer wasn't valid JSON. Try again.", retryable: true }
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    return { ok: false, error: `Claude's answer didn't match the expected format: ${formatZodError(parsed.error)}`, retryable: true }
  }
  return { ok: true, data: parsed.data, model: response.model, usage: response.usage }
}

// The JSON answer: text after the last fallback marker (if a fallback model took over)
function answerText(blocks: Anthropic.Beta.BetaContentBlock[]): string {
  const lastFallback = blocks.findLastIndex((block) => block.type === 'fallback')
  return blocks
    .slice(lastFallback + 1)
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim()
}

// Most specific first. Messages never include the API key.
function failure(error: unknown): { ok: false; error: string; retryable: boolean } {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { ok: false, error: 'Claude took too long to answer. Try again.', retryable: true }
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { ok: false, error: "Couldn't reach Claude. Check the internet connection and try again.", retryable: true }
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return { ok: false, error: 'Claude rejected the API key. Check ANTHROPIC_API_KEY in Vercel and .env.local.', retryable: false }
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return { ok: false, error: "This API key isn't allowed to use Claude. Check the Anthropic console (billing, limits).", retryable: false }
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { ok: false, error: 'Claude is busy (rate limit or spend limit). Wait a minute and try again.', retryable: true }
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { ok: false, error: `Claude rejected the request: ${error.message}`, retryable: false }
  }
  if (error instanceof Anthropic.InternalServerError) {
    return { ok: false, error: 'Claude is having trouble right now. Try again in a minute.', retryable: true }
  }
  if (error instanceof Anthropic.APIError) {
    return { ok: false, error: `Claude API error${error.status ? ` (${error.status})` : ''}: ${error.message}`, retryable: false }
  }
  return { ok: false, error: error instanceof Error ? error.message : 'Unknown error calling Claude', retryable: false }
}
