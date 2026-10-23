import 'server-only'
import { after } from 'next/server'
import { headers } from 'next/headers'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { deviceName } from '@/lib/device'

type Entry = { action: 'signed in' } | { action: 'opened patient'; patientId: string } | { action: 'opened visit'; patientId: string; visitId: string }
type Client = Awaited<ReturnType<typeof createClient>>

export type AccessEntry = {
  id: number
  at: string
  action: Entry['action']
  device: string | null
  visit_id: string | null
  patient: { id: string; name: string } | null
}

// For the Access log screen: the last sign-ins (every phone or computer that gets in signs in first, so
// one that isn't his shows there) and the records opened lately
export async function getAccessLog(): Promise<{ signIns: AccessEntry[]; opened: AccessEntry[] }> {
  await getDoctor()
  const supabase = await createClient()
  const columns = 'id, at, action, device, visit_id, patient:patients (id, name)'
  const [signIns, opened] = await Promise.all([
    supabase.from('access_log').select(columns).eq('action', 'signed in').order('at', { ascending: false }).limit(20),
    supabase.from('access_log').select(columns).neq('action', 'signed in').order('at', { ascending: false }).limit(100),
  ])
  if (signIns.error) throw signIns.error
  if (opened.error) throw opened.error
  // One patient each (the untyped client can't tell it isn't a list)
  return { signIns: signIns.data as unknown as AccessEntry[], opened: opened.data as unknown as AccessEntry[] }
}

// The access log (DPDP Rules: who accessed personal data, kept a year): each sign-in and each patient
// record opened, with the device. Written once the screen has gone to the phone, so it never slows one
// down; a failed write is not the doctor's problem. A record opened again within ten minutes (a save
// redraws the screen) is not written twice, and copies the phone keeps for no signal (public/sw.js marks
// those fetches) or screens Next fetches ahead in case they're opened are not people opening records,
// so they are not written at all.
export async function logAccess(entry: Entry, client?: Client) {
  const request = await headers()
  if (request.get('x-clinic-keep') || request.get('next-router-prefetch')) return
  const device = deviceName(request.get('user-agent') ?? '')
  const supabase = client ?? (await createClient())
  const row = {
    action: entry.action,
    patient_id: 'patientId' in entry ? entry.patientId : null,
    visit_id: 'visitId' in entry ? entry.visitId : null,
    device,
  }
  after(async () => {
    if (entry.action !== 'signed in') {
      const since = new Date(Date.now() - 10 * 60_000).toISOString()
      let recent = supabase.from('access_log').select('id').eq('action', entry.action).gte('at', since).limit(1)
      recent = 'visitId' in entry ? recent.eq('visit_id', entry.visitId) : recent.eq('patient_id', entry.patientId)
      if ((await recent).data?.length) return
    }
    await supabase.from('access_log').insert(row)
  })
}
