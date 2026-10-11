import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareNoteForAi } from './safe-content'
import { findIdentityLeaks } from './anonymise'

const identity = { name: 'Prakash Shetty', address: 'Near Church Road, Pangala, Udupi 576101', phone: '9845021763' }

const base = {
  today: '2026-10-11',
  identity,
  ageYears: 38,
  gender: 'male' as const,
  medicalAlerts: 'Prakash is allergic to penicillin. Wife Sunita knows.',
  notes:
    'Prakash Shetty from Pangala, Udupi 576101, phone 98450 21763, mail prakash.shetty@example.com. ' +
    'Pain lower right, tooth four six. Call +91 98450-21763 for the next visit. Rcts three thousand five hundred.',
}

describe('prepareNoteForAi', () => {
  it('sends age, gender, alerts and note, with every identifying detail replaced', () => {
    const prepared = prepareNoteForAi(base)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    const text = prepared.content.text

    for (const secret of ['Prakash', 'Shetty', 'Pangala', 'Udupi', '576101', '98450', '9845021763', 'example.com']) {
      expect(text).not.toContain(secret)
    }
    expect(text).toContain('Patient: 38-year-old male')
    expect(text).toContain('[PATIENT]')
    expect(text).toContain('[ADDRESS]')
    expect(text).toContain('[PHONE]')
    expect(text).toContain('[EMAIL]')
    expect(text).toContain('tooth four six')
    // 'Sunita' is on no record, but a capitalised name in the middle of a sentence is hidden too
    expect(text).not.toContain('Sunita')
    expect(text).toContain('[NAME1]')
    expect(text).toContain("Today's date: 2026-10-11")
  })

  it('gives the real details back only on the way home', () => {
    const prepared = prepareNoteForAi(base)
    if (!prepared.ok) throw new Error('expected ok')
    expect(prepared.restore('Complaint: [PATIENT] has pain')).toBe('Complaint: Prakash Shetty has pain')
  })

  it('has no field for date of birth, patient id or visit id', () => {
    const prepared = prepareNoteForAi(base)
    if (!prepared.ok) throw new Error('expected ok')
    expect(Object.keys(prepared.content)).toEqual(['text'])
    expect(prepared.content.text).not.toMatch(/\b19\d\d-\d\d-\d\d\b/)
  })

  it('shows "not given" rather than guessing when age and gender are unknown', () => {
    const prepared = prepareNoteForAi({ ...base, ageYears: null, gender: null })
    if (!prepared.ok) throw new Error('expected ok')
    expect(prepared.content.text).toContain('Patient: not given')
  })

  it('refuses to send when a name is glued into another word and could not be replaced', () => {
    const prepared = prepareNoteForAi({ ...base, notes: 'PrakashShettyji has pain in 46' })
    expect(prepared).toMatchObject({ ok: false })
  })
})

describe('findIdentityLeaks', () => {
  it('finds a word of the name, the address, the phone and an email', () => {
    const leaks = findIdentityLeaks('Shetty lives in Pangala, call 9845021763 or a@b.in', identity)
    expect(leaks).toEqual(expect.arrayContaining([
      "a word from the patient's name",
      "a word from the patient's address",
      "the patient's phone number",
      'an email address',
    ]))
  })

  it('does not repeat the identifying value in what it reports', () => {
    expect(JSON.stringify(findIdentityLeaks('Shetty 9845021763', identity))).not.toMatch(/Shetty|9845021763/)
  })

  it('is quiet on a clean clinical note', () => {
    expect(findIdentityLeaks('[PATIENT] has deep caries on 46. RCT 3500. Rs 4200 by UPI.', identity)).toEqual([])
  })
})

// The pipeline: which files may reach an AI service, and how
describe('the only route to the AI', () => {
  const root = path.join(__dirname, '..', '..')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(full)
    }
  }
  walk(root)
  const rel = (f: string) => path.relative(root, f).replaceAll('\\', '/')
  const source = (f: string) => readFileSync(f, 'utf8')

  it('keeps the AI SDKs inside the AI folder, the token action and the dictation client', () => {
    const allowed = new Set(['lib/actions/transcribe.ts', 'lib/live-transcribe.ts'])
    const offenders = files.filter(
      (f) => /from '@google\/genai'|from '@anthropic-ai\/sdk/.test(source(f)) && !rel(f).startsWith('lib/ai/') && !allowed.has(rel(f)),
    )
    expect(offenders.map(rel)).toEqual([])
  })

  it('has exactly one caller of generateNote, and it goes through prepareNoteForAi', () => {
    const callers = files.filter((f) => /\bgenerateNote\(/.test(source(f)) && !rel(f).endsWith('lib/ai/provider.ts'))
    expect(callers.map(rel)).toEqual(['lib/actions/smart-notes.ts'])
    const text = source(callers[0])
    expect(text).toContain('prepareNoteForAi(')
    // The raw model functions and the message builder are not used here
    expect(text).not.toMatch(/generateStructured|visitNoteContent|getGemini|getClaude/)
  })

  it('never lets the message builder be used outside the safe path', () => {
    const users = files.filter((f) => /\bvisitNoteContent\b/.test(source(f)))
    expect(users.map(rel).sort()).toEqual(['lib/ai/safe-content.ts', 'lib/ai/visit-prompt.ts'])
  })
})

describe('placeholders', () => {
  it('are not mistaken for a leak when the name is made of the same letters', () => {
    const prepared = prepareNoteForAi({ ...base, identity: { name: 'Patient Phone', address: null, phone: null }, notes: 'Patient Phone has pain in 46' })
    expect(prepared.ok).toBe(true)
  })
})
