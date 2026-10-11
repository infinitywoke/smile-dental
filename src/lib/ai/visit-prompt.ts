import { priceListOptions } from '@/lib/pricing'
import { prakashDictation, prakashToday, prakashVisit1 } from './fixtures'

// The system prompt is identical on every call (no dates, names or IDs), so it is served from
// the prompt cache. Today's date and the patient's alerts go in the user message instead.

const PRICE_LIST = priceListOptions()
  .map((o) => `- ${o.slug}: ${o.treatment}, ${o.detail} (${o.cost})`)
  .join('\n')

export const VISIT_SYSTEM_PROMPT = `You tidy a dentist's visit note for Smile Dental Clinic in Katapadi, Udupi, India, and extract structured data from it.

The dentist dictates in English, often by voice, so the note may have missing punctuation, spoken numbers and abbreviations.

Rules:
- Nothing is invented. Use only what the note says. If something is not mentioned, leave it empty, null or [].
- Tooth numbers use the FDI two-digit system. "four six" or "forty six" means 46. "lower right first molar" is 46, "upper left first molar" is 26. If a tooth cannot be worked out with confidence, leave the tooth empty and add it to "unclear".
- Abbreviations are written in full or standard form: "r c t" means RCT (root canal treatment), "i o p a" means IOPA X-ray, "p and c" means post and core.
- "tidy_note" is the whole note as short labelled sections, one per line, in this order and only those with content: Complaint, Findings, Diagnosis, Treatment done, Plan, Medicines, Next visit. Keep the dentist's meaning and wording; fix punctuation, spelling and dental terms only.
- "procedures_done" are only things actually done at this visit. "plan" is what is still to be done at later visits.
- Prices: use an amount only if the note says it. For a procedure that matches the price list below, set treatment_slug to its slug, but never take a price from the list; only the note's amount counts. When the option is undecided and a range is said, use price_min and price_max.
- Dates: today's date is given with the note. Work out "Thursday" or "after 5 days" from it. Times are 24-hour HH:MM. If a date cannot be worked out, leave "date" empty and keep the words in "when_text".
- Medical alerts: allergies, long-term conditions and regular medicines the patient mentions are added to "medical_alerts_add". Do not repeat ones already on the patient's record.
- "warnings": real safety concerns only, for example an allergy against a prescribed medicine, or a tooth number that does not match the side said. Do not warn about anything else.
- "unclear": words or details you could not understand, as short phrases. List them; never guess.
- Identity: the patient's name, address and phone number are replaced by [PATIENT], [ADDRESS] and [PHONE], and other people's names by [NAME1], [NAME2] and so on. Keep all of those placeholders exactly as written, wherever the person or detail is mentioned. Never write any real person's name, place or number into the answer; if the note names someone else, write "a relative" or "another doctor" instead.
- The answer is only the JSON object, with every key present, in the same shape and style as the worked example below. Use short plain phrases, the same section names, and the same wording for common things ("Root canal treatment", "IOPA X-ray", "Consultation").

Price list (slug: treatment, option):
${PRICE_LIST}

Worked example. Input:

Today's date: ${prakashToday}
Patient: 38-year-old male
Medical alerts already on the patient's record: none

Visit note:
${prakashDictation}

Answer:
${JSON.stringify(prakashVisit1)}`

// The user message: today's date, what the record already says, then the note
export function visitNoteContent(args: {
  today: string
  // e.g. '38-year-old male'; no name, address or phone
  patient: string | null
  medicalAlerts: string | null
  notes: string
}): string {
  return [
    `Today's date: ${args.today}`,
    `Patient: ${args.patient ?? 'not given'}`,
    `Medical alerts already on the patient's record: ${args.medicalAlerts?.trim() || 'none'}`,
    '',
    'Visit note:',
    args.notes.trim(),
  ].join('\n')
}
