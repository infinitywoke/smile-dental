'use server'

import { revalidatePath } from 'next/cache'
import { getClinicId, getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The owner keeps the clinic's chairs and dentists (the database checks). Dentists here are for scheduling only.
function finish(error: { code?: string; message: string } | null, fallback: string): Result {
  if (error) return { ok: false, error: error.code === 'P0001' ? error.message : fallback }
  revalidatePath('/app', 'layout')
  return { ok: true }
}

export async function addChair(name: string): Promise<Result> {
  const clinicId = await getClinicId()
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 60) return { ok: false, error: 'Please give the chair a name.' }
  const supabase = await createClient()
  const { error } = await supabase.from('chairs').insert({ clinic_id: clinicId, name: trimmed })
  return finish(error, 'Only the clinic’s owner can add a chair.')
}

export async function addDentist(input: { name: string; shortName: string; visiting: boolean }): Promise<Result> {
  const clinicId = await getClinicId()
  const name = input.name.trim()
  if (name.length < 2 || name.length > 100) return { ok: false, error: 'Please enter the dentist’s name.' }
  const supabase = await createClient()
  const { error } = await supabase.from('dentists').insert({
    clinic_id: clinicId,
    name,
    short_name: input.shortName.trim() || null,
    visiting: input.visiting === true,
  })
  return finish(error, 'Only the clinic’s owner can add a dentist.')
}

// Taken out of use, not deleted: past bookings keep their chair and dentist
export async function removeFromTeam(kind: 'chair' | 'dentist', id: string): Promise<Result> {
  await getDoctor()
  if (!UUID.test(id) || (kind !== 'chair' && kind !== 'dentist')) return { ok: false, error: 'Please try again.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from(kind === 'chair' ? 'chairs' : 'dentists').update({ active: false }).eq('id', id).select('id')
  if (!error && data.length === 0) return { ok: false, error: 'Only the clinic’s owner can change this.' }
  return finish(error, 'Could not change it. Please try again.')
}
