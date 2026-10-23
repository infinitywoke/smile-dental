'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { deviceName } from '@/lib/device'

// An error on a Clinic OS screen, from the phone (src/lib/report-error.ts): kept with where and on what
// device, for the daily health check to email the owner (.github/workflows/health.yml). Only a signed-in
// doctor can report; anyone else is ignored, quietly, so a report never interrupts a screen.
export async function reportAppError(input: { place: string; message: string; stack?: string }): Promise<void> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims?.sub) return
  const text = (value: unknown, max: number) => String(value ?? '').slice(0, max)
  await supabase.from('app_errors').insert({
    place: text(input.place, 300) || '/app',
    message: text(input.message, 1000) || 'Unknown error',
    stack: text(input.stack, 4000) || null,
    device: deviceName((await headers()).get('user-agent') ?? ''),
  })
}
