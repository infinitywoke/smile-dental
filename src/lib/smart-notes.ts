import 'server-only'
import { priceListOptions, type PriceListOption } from '@/lib/pricing'
import { LENGTHS } from '@/lib/schedule'

// Dr. Rahil records his notes after a visit; Gemini writes them out and sorts them, and suggests charges
// (by price-list item, never an amount) and a next visit (in how many days, how long). Only the
// recording and these instructions are sent: never the patient's name, phone, address, age, gender,
// medical alerts, history or bill. Nothing Gemini suggests is applied until he taps it.

const MODELS = [process.env.GEMINI_MODEL || 'gemini-3.8-flash', 'gemini-3.5-flash']
const TRY_MS = 60_000

// The clinic's price list as IDs ("P15"): Gemini names an item; the app shows its own price
export function priceListWithIds(): { id: string; option: PriceListOption }[] {
  return priceListOptions().map((option, i) => ({ id: `P${i + 1}`, option }))
}

export function smartNotesInstructions(): string {
  const list = priceListWithIds()
    .map(({ id, option }) => `${id} | ${option.treatment} | ${option.detail}`)
    .join('\n')
  return `You turn a dentist's spoken notes from one patient visit into tidy clinical notes for his own
records, plus suggestions he can accept or ignore. He is Dr. Rahil Yusuf (BDS), at a small dental
clinic in Katapadi, India. He speaks Indian English and may mix in Kannada, Tulu, Konkani, Hindi
or Malayalam words. Write everything in English.

Rules:
- Write only what he said. Never invent findings, teeth, medicines, doses or advice. If something
  was not said, leave that part empty.
- Keep his tooth numbers (FDI, 11-48, e.g. "46") and standard dental terms.
- If he says a person's name, phone number or address, leave it out (write "the patient").
- Prescription: one line per medicine, "name strength - how often - how long", exactly as he said.
  Never add or change a dose.
- Charges: suggest only items from the PRICE LIST below, by their ID, and only for treatment he
  says was done today (not planned for later). If nothing clearly matches, suggest nothing.
- Next visit: only if he mentions one ("review in a week", "next sitting on Thursday"). Give the
  number of days from today, and a length from 20, 40, 60, 80 or 120 minutes: what he says,
  otherwise the usual one (review or stitch removal 20; filling, scaling or extraction 40; root
  canal sitting 60; crown or bridge preparation 80).
- If the recording has nothing clinical in it, return everything empty.

PRICE LIST (ID | treatment | option):
${list}`
}

// The answer Gemini must give (checked again below before anything is shown)
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    complaint: { type: 'STRING' },
    findings: { type: 'STRING' },
    treatment: { type: 'STRING' },
    prescription: { type: 'ARRAY', items: { type: 'STRING' } },
    advice: { type: 'STRING' },
    charges: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, teeth: { type: 'STRING' }, why: { type: 'STRING' } }, required: ['id'] },
    },
    next_visit: {
      type: 'OBJECT',
      nullable: true,
      properties: { in_days: { type: 'INTEGER' }, length_minutes: { type: 'INTEGER' }, why: { type: 'STRING' } },
      required: ['in_days', 'length_minutes'],
    },
  },
  required: ['complaint', 'findings', 'treatment', 'prescription', 'advice', 'charges'],
}

export type SortedNotes = {
  complaint: string
  findings: string
  treatment: string
  prescription: string[]
  advice: string
  charges: { id: string; option: PriceListOption; teeth: string; why: string }[]
  nextVisit: { inDays: number; minutes: number; why: string } | null
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// Anything Gemini returns is checked: text is cut to size, unknown price-list IDs and odd lengths are dropped
export function checkSorted(raw: unknown): SortedNotes {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const items = new Map(priceListWithIds().map((x) => [x.id, x.option]))
  const charges = (Array.isArray(r.charges) ? r.charges : [])
    .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
    .filter((c) => typeof c.id === 'string' && items.has(c.id))
    .slice(0, 6)
    .map((c) => ({ id: c.id as string, option: items.get(c.id as string)!, teeth: text(c.teeth, 40), why: text(c.why, 120) }))
  const nv = r.next_visit && typeof r.next_visit === 'object' ? (r.next_visit as Record<string, unknown>) : null
  const inDays = Number(nv?.in_days)
  const minutes = Number(nv?.length_minutes)
  const nextVisit =
    nv && Number.isInteger(inDays) && inDays >= 1 && inDays <= 365 && (LENGTHS as readonly number[]).includes(minutes)
      ? { inDays, minutes, why: text(nv.why, 120) }
      : null
  return {
    complaint: text(r.complaint, 600),
    findings: text(r.findings, 1200),
    treatment: text(r.treatment, 1200),
    prescription: (Array.isArray(r.prescription) ? r.prescription : []).map((p) => text(p, 200)).filter(Boolean).slice(0, 12),
    advice: text(r.advice, 600),
    charges,
    nextVisit,
  }
}

// The notes as they go into the notes box
export function notesText(sorted: SortedNotes): string {
  const lines: string[] = []
  if (sorted.complaint) lines.push(`Complaint: ${sorted.complaint}`)
  if (sorted.findings) lines.push(`Findings: ${sorted.findings}`)
  if (sorted.treatment) lines.push(`Treatment: ${sorted.treatment}`)
  if (sorted.prescription.length > 0) lines.push('Prescription:', ...sorted.prescription.map((p) => `- ${p}`))
  if (sorted.advice) lines.push(`Advice: ${sorted.advice}`)
  return lines.join('\n')
}

// A pretend answer for the end-to-end tests (no recording leaves the test machine)
function fakeAnswer(): unknown {
  const rct = priceListWithIds().find((x) => x.option.slug === 'root-canal-treatment')
  return {
    complaint: 'Pain lower right back tooth for a week, worse at night',
    findings: 'Deep caries 46, tender on percussion',
    treatment: 'RCT started on 46',
    prescription: ['Amoxicillin 500 mg - three times a day - 5 days'],
    advice: 'Avoid chewing on the right side',
    charges: rct ? [{ id: rct.id, teeth: '46', why: 'root canal started' }] : [],
    next_visit: { in_days: 7, length_minutes: 60, why: 'second RCT sitting' },
  }
}

export async function sortVisitRecording(audio: Blob): Promise<SortedNotes> {
  if (process.env.GEMINI_FAKE === '1') return checkSorted(fakeAnswer())
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('Smart notes are not set up (no Gemini key).')

  const data = Buffer.from(await audio.arrayBuffer()).toString('base64')
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: smartNotesInstructions() }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: audio.type.split(';')[0] || 'audio/webm', data } }, { text: 'Here are the notes for this visit.' }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  })

  let lastProblem = 'Gemini did not answer.'
  for (const model of MODELS) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: AbortSignal.timeout(TRY_MS),
      })
      if (!response.ok) {
        lastProblem = `Gemini answered ${response.status}`
        // Busy or not available: try the next model; anything else won't get better
        if ([429, 500, 503, 404].includes(response.status)) continue
        break
      }
      const json = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const answer = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      return checkSorted(JSON.parse(answer))
    } catch (e) {
      lastProblem = e instanceof Error && e.name === 'TimeoutError' ? 'Gemini took too long.' : 'Could not read Gemini’s answer.'
    }
  }
  throw new Error(lastProblem)
}
