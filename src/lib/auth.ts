import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmail } from '@/lib/allowed-email'

export type Doctor = {
  id: string
  email: string
  name: string
}

// Data Access Layer: every Clinic OS page and server action calls this
// before touching data. It reads the session, so render it inside <Suspense>.
// Cached per request, so the layout, page and data functions share one check.
export const getDoctor = cache(async (): Promise<Doctor> => {
  // Session checks compare token expiry with the current time, so they must run at request time
  await connection()
  const supabase = await createClient()
  // The session is checked here with the project's public signing key (ES256), so no call to
  // Supabase Auth is needed on every screen and tap. An expired session is refreshed first.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims

  if (!claims?.sub) {
    redirect('/login')
  }
  if (!isAllowedEmail(claims.email)) {
    redirect('/login?error=not-allowed')
  }

  return {
    id: claims.sub,
    email: claims.email!,
    name: (claims.user_metadata?.full_name as string | undefined) ?? 'Dr. Rahil',
  }
})

// The clinic the signed-in person works in (the first they joined): the one the database shows them. Its
// folder holds the clinic's photos, recordings and bills (src/lib/clinic-files.ts).
export const getClinicId = cache(async (): Promise<string> => {
  await getDoctor()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('my_clinic_id')
  if (error || typeof data !== 'string') throw new Error('This login is not in a clinic.')
  return data
})
