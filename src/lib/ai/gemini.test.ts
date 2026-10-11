import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prakashVisit1 } from './fixtures'
import { visitSummarySchema } from './visit-summary'
import { VISIT_SYSTEM_PROMPT, visitNoteContent } from './visit-prompt'

// No network: the SDK's interactions.create is replaced with a fake
const create = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    interactions = { create }
  },
}))

async function load() {
  vi.resetModules()
  return import('./gemini')
}

const request = { system: 'You tidy dental notes.', content: 'Patient, four six', schema: visitSummarySchema }
const answer = (text: string, extra: Record<string, unknown> = {}) => ({
  status: 'completed',
  model: 'gemini-3.8-flash',
  output_text: text,
  ...extra,
})

beforeEach(() => {
  create.mockReset()
  process.env.GEMINI_API_KEY = 'test-key'
})

describe('geminiSchema', () => {
  it('keeps the structure and enums but drops keywords Gemini may reject', async () => {
    const { geminiSchema } = await load()
    const text = JSON.stringify(geminiSchema(visitSummarySchema))
    expect(text).toContain('"enum":["11","12"')
    expect(text).not.toContain('"pattern"')
    expect(text).not.toContain('"minimum"')
    expect(text).not.toContain('$schema')
    expect(text).toContain('"tidy_note"')
  })
})

describe('generateStructuredGemini', () => {
  it('sends the system prompt, schema and no-storage flag, and returns parsed data', async () => {
    create.mockResolvedValue(answer(JSON.stringify(prakashVisit1)))
    const { generateStructuredGemini, GEMINI_MODEL } = await load()
    const result = await generateStructuredGemini(request)

    expect(result).toMatchObject({ ok: true, data: prakashVisit1, model: 'gemini-3.8-flash' })
    expect(GEMINI_MODEL).toBe('gemini-3.8-flash')
    const params = create.mock.calls[0][0]
    expect(params).toMatchObject({
      model: 'gemini-3.8-flash',
      input: 'Patient, four six',
      system_instruction: 'You tidy dental notes.',
      store: false,
      response_format: { type: 'text', mime_type: 'application/json' },
    })
    expect(params.generation_config.thinking_level).toBe('low')
  })

  it('asks once more when the answer does not match, then succeeds', async () => {
    create
      .mockResolvedValueOnce(answer(JSON.stringify({ ...prakashVisit1, teeth: [{ tooth: '19', note: '' }] })))
      .mockResolvedValueOnce(answer(JSON.stringify(prakashVisit1)))
    const { generateStructuredGemini } = await load()
    expect(await generateStructuredGemini(request)).toMatchObject({ ok: true, data: prakashVisit1 })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('gives a readable error after two bad answers', async () => {
    create.mockResolvedValue(answer('not json'))
    const { generateStructuredGemini } = await load()
    const result = await generateStructuredGemini(request)
    expect(result).toMatchObject({ ok: false, retryable: true })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('turns API failures into plain messages without the key', async () => {
    const { generateStructuredGemini } = await load()

    create.mockRejectedValueOnce(Object.assign(new Error('API key not valid: test-key'), { status: 403 }))
    const rejected = await generateStructuredGemini(request)
    expect(rejected).toMatchObject({ ok: false, retryable: false })
    expect(JSON.stringify(rejected)).not.toContain('test-key')

    create.mockRejectedValueOnce(Object.assign(new Error('quota'), { status: 429 }))
    expect(await generateStructuredGemini(request)).toMatchObject({ ok: false, retryable: true })

    create.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 503 }))
    expect(await generateStructuredGemini(request)).toMatchObject({ ok: false, retryable: true })
  })

  it('reports a missing key without calling the service', async () => {
    delete process.env.GEMINI_API_KEY
    const { generateStructuredGemini } = await load()
    const result = await generateStructuredGemini(request)
    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('the prompt', () => {
  it('carries a worked example so every answer has the same shape', () => {
    expect(VISIT_SYSTEM_PROMPT).toContain('Worked example')
    expect(VISIT_SYSTEM_PROMPT).toContain('"tidy_note"')
    expect(VISIT_SYSTEM_PROMPT).toContain('[PATIENT]')
  })

  it('has no dates or names, so it can be cached', () => {
    expect(VISIT_SYSTEM_PROMPT).not.toMatch(/Prakash/)
  })

  it('puts the patient context, not the identity, in the message', () => {
    const content = visitNoteContent({ today: '2026-10-11', patient: '38-year-old male', medicalAlerts: null, notes: ' pain ' })
    expect(content).toContain('Patient: 38-year-old male')
    expect(content).toContain('Today\'s date: 2026-10-11')
    expect(content.endsWith('pain')).toBe(true)
  })
})
