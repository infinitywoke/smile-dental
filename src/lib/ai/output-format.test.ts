import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { prakashVisit1 } from './fixtures'
import { schemaComplexity, structuredOutputFormat } from './output-format'
import { FDI_TEETH, visitSummarySchema } from './visit-summary'

type Node = { [key: string]: unknown }

const format = structuredOutputFormat(visitSummarySchema)
const root = format.schema as Node

// Follows "#/$defs/..." references in the schema sent to the API
function resolve(node: unknown): Node {
  const n = node as Node
  const ref = n.$ref
  if (typeof ref !== 'string') return n
  return (root.$defs as Node)[ref.replace('#/$defs/', '')] as Node
}

function at(...path: string[]): Node {
  let node: Node = root
  for (const key of path) {
    node = resolve(node)
    if (key === '[]') node = node.items as Node
    else if (key === '?') node = (node.anyOf as Node[]).find((v) => v.type !== 'null') as Node
    else node = (node.properties as Node)[key] as Node
  }
  return resolve(node)
}

function allNodes(node: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(node)) node.forEach((n) => allNodes(n, out))
  else if (typeof node === 'object' && node !== null) {
    out.push(node as Node)
    Object.values(node).forEach((v) => allNodes(v, out))
  }
  return out
}

describe('visit summary as a structured-output schema', () => {
  it('stays inside the API complexity limits (16 unions, 24 optional)', () => {
    const { unions, optional } = schemaComplexity(root)
    expect(unions).toBeLessThanOrEqual(16)
    expect(optional).toBe(0)
  })

  it('uses no keywords the API rejects', () => {
    const banned = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'oneOf']
    for (const node of allNodes(root)) {
      if (node.type === 'object') expect(node.additionalProperties).toBe(false)
      for (const key of banned) expect(node, key).not.toHaveProperty(key)
    }
  })

  it('sends tooth numbers, payment method and date/time shapes as enforceable constraints', () => {
    expect(at('teeth', '[]', 'tooth').enum).toEqual([...FDI_TEETH])
    expect(at('plan', '[]', 'tooth').enum).toEqual([...FDI_TEETH, ''])
    expect(at('payment', '?', 'method').enum).toEqual(['upi', 'cash', ''])
    expect(at('next_visit', '?', 'date').pattern).toEqual(expect.any(String))
    expect(at('next_visit', '?', 'time').pattern).toEqual(expect.any(String))
  })

  it('keeps patterns simple enough for the API', () => {
    for (const node of allNodes(root)) {
      if (typeof node.pattern !== 'string') continue
      expect(node.pattern).not.toMatch(/\(\?[=!<]|\\[1-9bB]/)
    }
  })

  it('parses a reply with Zod and rejects bad ones', () => {
    expect(format.parse(JSON.stringify(prakashVisit1))).toEqual(prakashVisit1)
    expect(() => format.parse('{"tidy_note": "cut off')).toThrow(/JSON/)
    expect(() => format.parse(JSON.stringify({ ...prakashVisit1, teeth: [{ tooth: '49', note: '' }] }))).toThrow()
  })
})

describe('structuredOutputFormat', () => {
  it('restores enum, const and pattern inside nullable and nested schemas', () => {
    const schema = z.object({
      kind: z.literal('visit'),
      when: z.object({ time: z.string().regex(/^[0-9]{2}:[0-9]{2}$/) }).nullable(),
      tags: z.array(z.enum(['a', 'b'])),
      day: z.iso.date(),
    })
    const sent = structuredOutputFormat(schema).schema as Node
    const props = sent.properties as Record<string, Node>
    expect(props.kind.const).toBe('visit')
    const when = (props.when.anyOf as Node[]).find((v) => v.type === 'object') as Node
    expect((when.properties as Record<string, Node>).time.pattern).toBe('^[0-9]{2}:[0-9]{2}$')
    expect((props.tags.items as Node).enum).toEqual(['a', 'b'])
    // A supported format is enforced by the API on its own, so its pattern is not added back
    expect(props.day.format).toBe('date')
    expect(props.day).not.toHaveProperty('pattern')
  })

  it('counts unions and optional properties', () => {
    const schema = z.object({
      a: z.string().nullable(),
      b: z.number().optional(),
      c: z.array(z.object({ d: z.boolean().nullable() })),
    })
    expect(schemaComplexity(structuredOutputFormat(schema).schema as Node)).toEqual({ unions: 2, optional: 1 })
  })
})
