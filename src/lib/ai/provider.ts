import 'server-only'
import type { z } from 'zod'
import { generateStructured, CLAUDE_MODEL, type StructuredResult } from './claude'
import { generateStructuredGemini, GEMINI_MODEL } from './gemini'
import type { SafeNoteContent } from './safe-content'

// Which AI answers. Gemini is the default until Claude access is available; set AI_PROVIDER=claude
// in Vercel and .env.local to switch. Both take the same anonymised note and return the same shape.
export type AiProvider = 'gemini' | 'claude'

export function activeProvider(): AiProvider {
  return process.env.AI_PROVIDER === 'claude' ? 'claude' : 'gemini'
}

export function activeModel(): string {
  return activeProvider() === 'claude' ? CLAUDE_MODEL : GEMINI_MODEL
}

export async function generateNote<T extends z.ZodType>(args: {
  system: string
  // Only what `prepareNoteForAi` produced: anonymised, and checked for identifying details
  content: SafeNoteContent
  schema: T
  maxTokens?: number
}): Promise<StructuredResult<z.infer<T>>> {
  const request = { system: args.system, content: args.content.text, schema: args.schema, maxTokens: args.maxTokens }
  return activeProvider() === 'claude' ? generateStructured(request) : generateStructuredGemini(request)
}
