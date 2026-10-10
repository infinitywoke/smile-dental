import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { AutoParseableBetaOutputFormat } from '@anthropic-ai/sdk/lib/beta-parser'
import { z } from 'zod'

type JsonSchema = { [key: string]: unknown }

// Structured-output format for a Zod schema: the SDK's Zod helper (strips keywords the API
// rejects, validates the reply with Zod) plus a fix for what it drops.
//
// The SDK's schema transform (v0.133) moves `enum`, `const` and `pattern` into the description
// text instead of sending them, although the API enforces them. Putting them back means the
// model can only write, say, a real FDI tooth number instead of failing Zod validation later.
// `pattern` is restored only where there's no `format`, and patterns we use must stay simple
// (no lookarounds, backreferences or \b).
export function structuredOutputFormat<T extends z.ZodType>(schema: T): AutoParseableBetaOutputFormat<z.infer<T>> {
  const format = betaZodOutputFormat(schema)
  restoreKeywords(z.toJSONSchema(schema, { reused: 'ref' }) as JsonSchema, format.schema)
  return format
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Walks the original Zod JSON Schema and the SDK's transformed copy side by side
// (same shape: properties, items, anyOf/oneOf → anyOf, allOf, $defs)
function restoreKeywords(source: JsonSchema, target: JsonSchema) {
  if (Array.isArray(source.enum)) target.enum = source.enum
  if ('const' in source) target.const = source.const
  if (typeof source.pattern === 'string' && target.format === undefined) target.pattern = source.pattern

  for (const key of ['properties', '$defs']) {
    const from = source[key]
    const to = target[key]
    if (!isSchema(from) || !isSchema(to)) continue
    for (const name of Object.keys(from)) {
      const a = from[name]
      const b = to[name]
      if (isSchema(a) && isSchema(b)) restoreKeywords(a, b)
    }
  }

  if (isSchema(source.items) && isSchema(target.items)) restoreKeywords(source.items, target.items)

  const pairs: [unknown, unknown][] = [
    [source.anyOf ?? source.oneOf, target.anyOf],
    [source.allOf, target.allOf],
  ]
  for (const [from, to] of pairs) {
    if (!Array.isArray(from) || !Array.isArray(to)) continue
    from.forEach((a, i) => {
      const b = to[i]
      if (isSchema(a) && isSchema(b)) restoreKeywords(a, b)
    })
  }
}

// Counts what the API limits per request (structured outputs "schema complexity limits"):
// at most 24 optional properties and 16 properties whose type is a union (anyOf / type array,
// which is what `.nullable()` produces). Used by tests to keep schemas inside the limits.
export function schemaComplexity(schema: JsonSchema): { optional: number; unions: number } {
  let optional = 0
  let unions = 0
  const visit = (node: unknown) => {
    if (!isSchema(node)) return
    if (Array.isArray(node.anyOf) || Array.isArray(node.type)) unions++
    if (isSchema(node.properties)) {
      const required = Array.isArray(node.required) ? node.required : []
      for (const [name, child] of Object.entries(node.properties)) {
        if (!required.includes(name)) optional++
        visit(child)
      }
    }
    if (isSchema(node.$defs)) Object.values(node.$defs).forEach(visit)
    visit(node.items)
    for (const key of ['anyOf', 'allOf']) {
      const list = node[key]
      if (Array.isArray(list)) list.forEach(visit)
    }
  }
  visit(schema)
  return { optional, unions }
}
