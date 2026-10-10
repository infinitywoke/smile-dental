import { z } from 'zod'
import { formatZodError } from './zod-error'

// Visit summary v1: what Claude extracts from a visit note, and what visits.summary stores.
//
// Every key is always present, so "not mentioned" is explicit and never a missing key:
// - text (including tooth, date, time and payment method) is '' when there's nothing to say
// - numbers (rupees, days) and the three optional sections are null
// - lists are []
// Why '' rather than null for text: the API allows at most 16 union-typed (nullable) fields
// per structured-output schema, and making every field nullable would need about 25.

export const SUMMARY_VERSION = 1

// FDI two-digit tooth numbers
export const FDI_TEETH = [
  '11', '12', '13', '14', '15', '16', '17', '18',
  '21', '22', '23', '24', '25', '26', '27', '28',
  '31', '32', '33', '34', '35', '36', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48',
  '51', '52', '53', '54', '55',
  '61', '62', '63', '64', '65',
  '71', '72', '73', '74', '75',
  '81', '82', '83', '84', '85',
] as const

export type FdiTooth = (typeof FDI_TEETH)[number]

const fdiSet = new Set<string>(FDI_TEETH)

// '46' → true; 46, '19', '50', '056', ' 46' → false
export function isFdiTooth(value: unknown): value is FdiTooth {
  return typeof value === 'string' && fdiSet.has(value)
}

const toothError = (issue: { input?: unknown }) =>
  `"${String(issue.input)}" is not an FDI tooth number (permanent 11–18, 21–28, 31–38, 41–48; primary 51–55, 61–65, 71–75, 81–85)`

// Sent to the API as enums, so the model can only pick a real tooth
const tooth = z.enum(FDI_TEETH, { error: toothError })
const toothOrNone = z.enum([...FDI_TEETH, ''], { error: toothError })

// Rupees. `minimum` isn't supported by structured outputs: the SDK leaves it out of the schema
// it sends (it becomes a hint in the description) and Zod still enforces it on the reply.
const rupees = () => z.number().nonnegative()

const DATE = /^([0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01]))?$/
const TIME = /^(([01][0-9]|2[0-3]):[0-5][0-9])?$/

export const visitSummarySchema = z.object({
  tidy_note: z.string().describe('The whole note as a tidy clinical note in short sections. Nothing invented.'),
  complaint: z.string().describe('Chief complaint, or empty'),
  findings: z.string().describe('Examination and investigation findings, or empty'),
  teeth: z.array(z.object({
    tooth,
    note: z.string(),
  })).describe('Each tooth mentioned, with what was said about it'),
  diagnoses: z.array(z.object({
    tooth: toothOrNone,
    diagnosis: z.string(),
  })),
  procedures_done: z.array(z.object({
    tooth: toothOrNone,
    procedure: z.string(),
    treatment_slug: z.string().describe('Price-list slug when the procedure matches one, else empty'),
    amount: rupees().nullable().describe('Rupees charged for it today, or null'),
  })).describe('Procedures actually done at this visit'),
  plan: z.array(z.object({
    tooth: toothOrNone,
    procedure: z.string(),
    price: rupees().nullable().describe('Rupees, once the option is decided'),
    price_min: rupees().nullable().describe('Lowest price while the option is undecided'),
    price_max: rupees().nullable().describe('Highest price while the option is undecided'),
  })).describe('Treatment still to do at later visits'),
  medicines: z.array(z.object({
    name: z.string(),
    dose: z.string(),
    frequency: z.string(),
    duration: z.string(),
    instructions: z.string(),
  })),
  aftercare: z.array(z.string()),
  next_visit: z.object({
    when_text: z.string().describe('The next visit as said, e.g. "Thursday 15th, 6 PM"'),
    date: z.string().regex(DATE, 'Use YYYY-MM-DD or empty').describe('YYYY-MM-DD if it can be worked out, else empty'),
    time: z.string().regex(TIME, 'Use 24-hour HH:MM or empty').describe('24-hour HH:MM, else empty'),
    within_days: z.int().nonnegative().nullable().describe('For "review in 5–7 days": the larger number of days, else null'),
  }).nullable(),
  payment: z.object({
    collected: rupees().nullable(),
    method: z.enum(['upi', 'cash', '']),
    advance: rupees().nullable(),
    balance_next_visit: rupees().nullable(),
  }).nullable(),
  patient_updates: z.object({
    medical_alerts_add: z.array(z.string()).describe('New allergies, conditions or regular medicines'),
    preferred_times: z.string(),
  }).nullable(),
  warnings: z.array(z.string()).describe('Safety concerns, e.g. tooth number vs side, allergy vs medicine'),
  unclear: z.array(z.string()).describe('Words or details that could not be understood, listed rather than guessed'),
})

export type VisitSummary = z.infer<typeof visitSummarySchema>

export type ParseVisitSummaryResult =
  | { ok: true; summary: VisitSummary }
  | { ok: false; error: string }

export function parseVisitSummary(json: unknown): ParseVisitSummaryResult {
  const result = visitSummarySchema.safeParse(json)
  if (result.success) return { ok: true, summary: result.data }
  return { ok: false, error: formatZodError(result.error) }
}
