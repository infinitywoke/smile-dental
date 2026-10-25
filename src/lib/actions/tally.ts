'use server'

import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getLedgerPatients } from '@/lib/data/tally'
import { patientAge } from '@/lib/patient-fields'
import { cleanLedger, tallyGroupNamed } from '@/lib/tally'
import { matchLedgers } from '@/lib/tally-ledgers'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The dentist's Tally ledger names (typed once, exactly as in Tally) and one entry per payment or per day.
// Each payment goes to the patient's own ledger, so the income ledger is needed only for one per day.
export async function saveTallySettings(formData: FormData): Promise<{ error?: string }> {
  const doctor = await getDoctor()
  const cash = cleanLedger(formData.get('cash'))
  const bank = cleanLedger(formData.get('bank'))
  const entries = formData.get('entries') === 'day' ? 'day' : 'payment'
  const income = entries === 'day' ? cleanLedger(formData.get('income')) : null
  if (!cash || !bank) return { error: 'Please type both ledger names, exactly as they are in Tally.' }
  if (entries === 'day' && !income) return { error: 'One entry per day needs the income ledger, exactly as it is in Tally.' }
  const group = [cash, bank, income].map((name) => (name ? tallyGroupNamed(name) : null)).find(Boolean)
  if (group) {
    return { error: `"${group}" is a group in Tally, not a ledger. Type the ledger inside it (in Tally: Display → List of Accounts, under ${group}).` }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('tally_settings')
    .upsert({ owner_id: doctor.id, cash_ledger: cash, bank_ledger: bank, income_ledger: income, entries }, { onConflict: 'owner_id' })
  if (error) return { error: "Couldn't save. Check the internet and try again." }
  revalidatePath('/app/tally')
  return {}
}

export type LedgerQuestion = { patientId: string; name: string; age: number | null; address: string | null; options: string[]; sure: boolean }

// His patient ledgers (read from his List of Accounts on the phone or PC; only the names come here) against
// the patients not yet matched. A ledger Clinic OS already named that his list now has is matched at once.
export async function matchTallyLedgers(names: unknown): Promise<{ error?: string; questions?: LedgerQuestion[]; matchedNow?: number; noLedger?: number }> {
  await getDoctor()
  if (!Array.isArray(names) || names.length === 0 || names.length > 20000) return { error: 'No patient ledgers found in that file.' }
  const ledgers = [...new Set(names.map(cleanLedger).filter((n): n is string => !!n))]
  const supabase = await createClient()

  const { data: named, error } = await supabase.from('patients').select('id, tally_ledger').eq('tally_ledger_listed', false).not('tally_ledger', 'is', null).limit(10000)
  if (error) return { error: "Couldn't read your patients. Check the internet and try again." }
  const inList = new Set(ledgers.map((l) => l.toLowerCase()))
  const found = named.filter((p) => inList.has(String(p.tally_ledger).toLowerCase())).map((p) => p.id)
  if (found.length > 0) {
    const { error: listError } = await supabase.from('patients').update({ tally_ledger_listed: true }).in('id', found)
    if (listError) return { error: "Couldn't save. Check the internet and try again." }
  }

  const { unmatched } = await getLedgerPatients()
  const taken = new Set((await supabase.from('patients').select('tally_ledger').eq('tally_ledger_listed', true).limit(10000)).data?.map((p) => String(p.tally_ledger).toLowerCase()))
  const free = ledgers.filter((l) => !taken.has(l.toLowerCase()))
  const byId = new Map(unmatched.map((p) => [p.id, p]))
  const matches = matchLedgers(unmatched, free)
  const questions = matches
    .filter((m) => m.options.length > 0)
    .map((m) => {
      const p = byId.get(m.patientId)!
      return { patientId: p.id, name: p.name, age: patientAge(p), address: p.address, options: m.options.slice(0, 5), sure: m.sure }
    })
  revalidatePath('/app/tally')
  return { questions, matchedNow: found.length, noLedger: matches.length - questions.length }
}

// The ledgers he confirmed: each saved on its patient as seen in his list
export async function saveTallyLedgers(choices: unknown): Promise<{ error?: string; saved?: number }> {
  await getDoctor()
  if (!Array.isArray(choices) || choices.length > 10000) return { error: 'Something went wrong.' }
  const picked = choices
    .map((c) => ({ patientId: String((c as { patientId?: unknown })?.patientId ?? ''), ledger: cleanLedger((c as { ledger?: unknown })?.ledger) }))
    .filter((c): c is { patientId: string; ledger: string } => UUID.test(c.patientId) && !!c.ledger)
  const ledgers = picked.map((c) => c.ledger.toLowerCase())
  if (new Set(ledgers).size !== ledgers.length) return { error: 'The same ledger is chosen for two patients. One ledger is one person: change one of them.' }
  const supabase = await createClient()
  for (const c of picked) {
    const { error } = await supabase.from('patients').update({ tally_ledger: c.ledger, tally_ledger_listed: true }).eq('id', c.patientId)
    if (error) return { error: "Couldn't save them all. Check the internet and try again." }
  }
  revalidatePath('/app/tally')
  return { saved: picked.length }
}
