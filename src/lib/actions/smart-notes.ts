'use server'

import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ageOn, todayInIndia } from '@/lib/dates'
import { generateNote } from '@/lib/ai/provider'
import { anonymise, restoreDeep } from '@/lib/ai/anonymise'
import { parseGender } from '@/lib/gender'
import { VISIT_SYSTEM_PROMPT, visitNoteContent } from '@/lib/ai/visit-prompt'
import { allWarnings } from '@/lib/ai/safety'
import { SUMMARY_VERSION, parseVisitSummary, visitSummarySchema, type VisitSummary } from '@/lib/ai/visit-summary'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A note shorter than this has nothing to tidy
const MIN_NOTE_LENGTH = 8
const MAX_NOTE_LENGTH = 8000

// Reads the saved note and asks the AI to tidy it. Nothing is saved here (apart from keeping the
// original words safe): the doctor sees the Confirm card first, so a wrong answer never touches
// the record. Name, address and phone are swapped for placeholders before anything is sent.
export async function tidyVisitNote(visitId: string): Promise<{ error?: string; summary?: VisitSummary }> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Something went wrong. Please reopen the visit.' }

  const supabase = await createClient()
  const { data: visit } = await supabase
    .from('visits')
    .select('notes, notes_original, patient:patients!inner (name, phone, address, date_of_birth, gender, medical_alerts)')
    .eq('id', visitId)
    .maybeSingle()
  if (!visit) return { error: 'That visit was not found.' }

  const notes = visit.notes.trim()
  if (notes.length < MIN_NOTE_LENGTH) return { error: 'Write or dictate the note first, then tidy it up.' }
  if (notes.length > MAX_NOTE_LENGTH) return { error: 'This note is too long to tidy in one go. Shorten it and try again.' }

  const patient = (Array.isArray(visit.patient) ? visit.patient[0] : visit.patient) as {
    name: string
    phone: string | null
    address: string | null
    date_of_birth: string | null
    gender: string | null
    medical_alerts: string | null
  }

  // The dictated words are kept as they were, before anything is tidied or sent anywhere
  if (visit.notes_original === null) {
    await supabase.from('visits').update({ notes_original: visit.notes }).eq('id', visitId).is('notes_original', null)
  }

  const identity = { name: patient.name, address: patient.address, phone: patient.phone }
  const safeNotes = anonymise(notes, identity)
  const safeAlerts = patient.medical_alerts ? anonymise(patient.medical_alerts, identity).text : null
  const age = patient.date_of_birth ? ageOn(patient.date_of_birth) : null
  const who = [age !== null ? `${age}-year-old` : null, parseGender(patient.gender)].filter(Boolean).join(' ') || null

  const result = await generateNote({
    system: VISIT_SYSTEM_PROMPT,
    content: visitNoteContent({ today: todayInIndia(), patient: who, medicalAlerts: safeAlerts, notes: safeNotes.text }),
    schema: visitSummarySchema,
    maxTokens: 8_000,
  })
  if (!result.ok) return { error: result.error }

  // Real details go back in, then the deterministic safety checks are added to the model's own warnings
  const summary = restoreDeep(result.data, safeNotes.restore)
  return { summary: { ...summary, warnings: allWarnings(patient.medical_alerts, summary) } }
}

function alreadyListed(existing: string, alert: string): boolean {
  return existing.toLowerCase().includes(alert.trim().toLowerCase())
}

// Saves the confirmed summary: the tidy note replaces the note (the dictation is kept as the
// original), procedures become bill lines, the plan becomes treatment items, new alerts join the
// patient's record. Safe to run twice: lines and plan items are not duplicated.
export async function confirmVisitSummary(visitId: string, input: unknown): Promise<{ error?: string }> {
  await getDoctor()
  if (!UUID.test(visitId)) return { error: 'Something went wrong. Please reopen the visit.' }
  const parsed = parseVisitSummary(input)
  if (!parsed.ok) return { error: 'The summary could not be read. Please tidy the note again.' }
  const summary = parsed.summary

  const supabase = await createClient()
  const { data: visit } = await supabase
    .from('visits')
    .select('notes, notes_original, patient_id, patient:patients!inner (medical_alerts, preferred_times)')
    .eq('id', visitId)
    .maybeSingle()
  if (!visit) return { error: 'That visit was not found.' }
  const patient = (Array.isArray(visit.patient) ? visit.patient[0] : visit.patient) as {
    medical_alerts: string | null
    preferred_times: string | null
  }

  const tidy = summary.tidy_note.trim()
  const { error: saveError } = await supabase
    .from('visits')
    .update({
      notes: tidy || visit.notes,
      notes_original: visit.notes_original ?? visit.notes,
      summary: { version: SUMMARY_VERSION, ...summary },
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', visitId)
  if (saveError) return { error: 'Could not save the summary. Please try again.' }

  // Bill lines for procedures that carry an amount and are not already on the bill
  const { data: existingCharges } = await supabase.from('visit_charges').select('description').eq('visit_id', visitId)
  const onBill = new Set((existingCharges ?? []).map((c) => c.description.trim().toLowerCase()))
  const lines = summary.procedures_done
    .filter((p) => p.amount !== null && p.amount > 0)
    .map((p) => ({
      visit_id: visitId,
      patient_id: visit.patient_id,
      description: (p.tooth ? `${p.procedure} (${p.tooth})` : p.procedure).trim().slice(0, 200),
      amount: p.amount as number,
      kind: 'item' as const,
      treatment_slug: p.treatment_slug || null,
    }))
    .filter((line) => line.description && !onBill.has(line.description.toLowerCase()))
  if (lines.length > 0) {
    const { error } = await supabase.from('visit_charges').insert(lines)
    if (error) return { error: 'The summary was saved, but the bill lines could not be added. Add them on the Bill step.' }
  }

  // The plan from this visit replaces any earlier plan taken from the same visit
  const { error: clearError } = await supabase
    .from('treatment_items')
    .delete()
    .eq('planned_visit_id', visitId)
    .eq('status', 'planned')
  if (clearError) return { error: 'The summary was saved, but the plan could not be updated.' }
  if (summary.plan.length > 0) {
    const { error } = await supabase.from('treatment_items').insert(
      summary.plan.map((p) => ({
        patient_id: visit.patient_id,
        tooth: p.tooth || null,
        procedure: p.procedure.trim() || 'Treatment',
        price: p.price,
        price_min: p.price_min,
        price_max: p.price_max,
        status: 'planned' as const,
        planned_visit_id: visitId,
      })),
    )
    if (error) return { error: 'The summary was saved, but the plan could not be added.' }
  }

  // New allergies and conditions join the patient's alerts; they show at the top of every visit
  const updates: { medical_alerts?: string; preferred_times?: string } = {}
  let alerts = patient.medical_alerts?.trim() ?? ''
  for (const alert of summary.patient_updates?.medical_alerts_add ?? []) {
    if (alert.trim() && !alreadyListed(alerts, alert)) alerts = alerts ? `${alerts}; ${alert.trim()}` : alert.trim()
  }
  if (alerts !== (patient.medical_alerts?.trim() ?? '')) updates.medical_alerts = alerts
  const preferred = summary.patient_updates?.preferred_times.trim()
  if (preferred && preferred !== patient.preferred_times) updates.preferred_times = preferred
  if (Object.keys(updates).length > 0) {
    await supabase.from('patients').update(updates).eq('id', visit.patient_id)
  }

  revalidatePath('/app', 'layout')
  return {}
}
