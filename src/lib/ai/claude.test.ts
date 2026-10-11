import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prakashVisit1 } from './fixtures'
import { visitSummarySchema } from './visit-summary'

// No network: the SDK client's messages.create is replaced with a fake
const create = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))
vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>()
  class FakeAnthropic extends actual.default {
    beta = { messages: { create } } as never
  }
  return { ...actual, default: FakeAnthropic }
})

// Fresh module (and client singleton) per test, plus the SDK copy that module sees
async function load() {
  vi.resetModules()
  const claude = await import('./claude')
  const { default: SDK } = await import('@anthropic-ai/sdk')
  return { ...claude, SDK }
}

function reply(content: unknown[], stop_reason = 'end_turn', extra: Record<string, unknown> = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content,
    stop_reason,
    stop_details: null,
    usage: { input_tokens: 1200, output_tokens: 800 },
    ...extra,
  }
}

const request = { system: 'You tidy dental notes.', content: 'Prakash, four six, r c t...', schema: visitSummarySchema }

beforeEach(() => {
  create.mockReset()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
})

describe('getClaude', () => {
  it('explains a missing key without calling the API', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { getClaude, generateStructured } = await load()
    expect(() => getClaude()).toThrow('ANTHROPIC_API_KEY is not set — add it in Vercel and .env.local')
    expect(await generateStructured(request)).toEqual({
      ok: false,
      error: 'ANTHROPIC_API_KEY is not set — add it in Vercel and .env.local',
      retryable: false,
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('reuses one client', async () => {
    const { getClaude } = await load()
    expect(getClaude()).toBe(getClaude())
  })
})

describe('generateStructured', () => {
  it('sends a cached system prompt, effort and the schema, and returns parsed data', async () => {
    create.mockResolvedValue(reply([
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: JSON.stringify(prakashVisit1) },
    ]))
    const { generateStructured, CLAUDE_MODEL } = await load()
    const result = await generateStructured({ ...request, effort: 'high' })

    expect(result).toMatchObject({ ok: true, data: prakashVisit1, model: 'claude-haiku-5-5' })
    const params = create.mock.calls[0][0]
    expect(params).toMatchObject({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: 'You tidy dental notes.', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'Prakash, four six, r c t...' }],
      output_config: { effort: 'high', format: { type: 'json_schema' } },
    })
    expect(JSON.stringify(params.output_config.format.schema)).toContain('"enum":["11","12"')
    expect(CLAUDE_MODEL).toBe('claude-haiku-5-5')
    expect(params).not.toHaveProperty('fallbacks')
  })

  it('defaults to medium effort', async () => {
    create.mockResolvedValue(reply([{ type: 'text', text: JSON.stringify(prakashVisit1) }]))
    const { generateStructured } = await load()
    await generateStructured(request)
    expect(create.mock.calls[0][0].output_config.effort).toBe('medium')
  })

  it('reads the answer after a fallback model took over', async () => {
    create.mockResolvedValue(reply([
      { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } },
      { type: 'text', text: JSON.stringify(prakashVisit1) },
    ], 'end_turn', { model: 'claude-opus-4-8' }))
    const { generateStructured } = await load()
    expect(await generateStructured(request)).toMatchObject({ ok: true, data: prakashVisit1, model: 'claude-opus-4-8' })
  })

  it('handles a refusal before reading the content', async () => {
    create.mockResolvedValue(reply([], 'refusal', { stop_details: { type: 'refusal', category: 'bio', explanation: null } }))
    const { generateStructured } = await load()
    const result = await generateStructured(request)
    expect(result).toMatchObject({ ok: false, retryable: false })
    expect(!result.ok && result.error).toContain('declined this request (bio)')
  })

  it('handles an answer cut off by max_tokens', async () => {
    create.mockResolvedValue(reply([{ type: 'text', text: '{"tidy_note": "Complaint: pain' }], 'max_tokens'))
    const { generateStructured } = await load()
    expect(await generateStructured(request)).toMatchObject({ ok: false, error: expect.stringContaining('ran out of room') })
  })

  it('reports an answer that fails validation', async () => {
    const bad = { ...prakashVisit1, teeth: [{ tooth: '49', note: '' }] }
    create.mockResolvedValue(reply([{ type: 'text', text: JSON.stringify(bad) }]))
    const { generateStructured } = await load()
    const result = await generateStructured(request)
    expect(result).toMatchObject({ ok: false, retryable: true })
    expect(!result.ok && result.error).toContain('teeth.0.tooth')
  })

  it('reports an empty answer', async () => {
    create.mockResolvedValue(reply([]))
    const { generateStructured } = await load()
    expect(await generateStructured(request)).toMatchObject({ ok: false, retryable: true })
  })

  it('turns SDK errors into safe messages', async () => {
    const { generateStructured, SDK } = await load()
    const headers = new Headers()
    const cases: [unknown, string, boolean][] = [
      [new SDK.RateLimitError(429, undefined, 'rate limited', headers), 'Wait a minute', true],
      [new SDK.AuthenticationError(401, undefined, 'invalid x-api-key', headers), 'rejected the API key', false],
      [new SDK.BadRequestError(400, undefined, 'Schema is too complex for compilation.', headers), 'Schema is too complex', false],
      [new SDK.InternalServerError(529, undefined, 'overloaded', headers), 'having trouble', true],
      [new SDK.APIConnectionTimeoutError(), 'took too long', true],
      [new SDK.APIConnectionError({ message: 'socket hang up' }), "Couldn't reach Claude", true],
    ]
    for (const [error, message, retryable] of cases) {
      create.mockRejectedValueOnce(error)
      const result = await generateStructured(request)
      expect(result).toMatchObject({ ok: false, retryable })
      expect(!result.ok && result.error).toContain(message)
      expect(!result.ok && result.error).not.toContain('test-key')
    }
  })
})
