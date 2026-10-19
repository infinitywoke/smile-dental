'use server'

import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { cleanLedger } from '@/lib/tally'

// The dentist's Tally ledger names (typed once, exactly as in Tally) and one entry per payment or per day
export async function saveTallySettings(formData: FormData): Promise<{ error?: string }> {
  const doctor = await getDoctor()
  const cash = cleanLedger(formData.get('cash'))
  const bank = cleanLedger(formData.get('bank'))
  const income = cleanLedger(formData.get('income'))
  const entries = formData.get('entries') === 'day' ? 'day' : 'payment'
  if (!cash || !bank || !income) return { error: 'Please type all three ledger names, exactly as they are in Tally.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('tally_settings')
    .upsert({ owner_id: doctor.id, cash_ledger: cash, bank_ledger: bank, income_ledger: income, entries }, { onConflict: 'owner_id' })
  if (error) return { error: "Couldn't save. Check the internet and try again." }
  revalidatePath('/app/tally')
  return {}
}
