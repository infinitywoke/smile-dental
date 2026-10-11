import 'server-only'
import type { z } from 'zod'
import { generateStructured, CLAUDE_MODEL, type StructuredResult } from './claude'
import { generateStructuredGemini, GEMINI_MODEL } from './gemini'

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
  content: string
  schema: T
  maxTokens?: number
}): Promise<StructuredResult<z.infer<T>>> {
  return activeProvider() === 'claude' ? generateStructured(args) : generateStructuredGemini(args)
}
