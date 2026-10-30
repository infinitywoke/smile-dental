import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type Doctor = {
  id: string
  email: string
  // The clinic they work in (the first they joined): the one the database shows them
  clinicId: string
}

// Data Access Layer: every Clinic OS page and server action calls this
// before touching data. It reads the session, so render it inside <Suspense>.
// Cached per request, so the layout, page and data functions share one check. A login gets in by being a
// member of a clinic (clinic_members, which the operator's setup_clinic fills): one that isn't sees nothing.
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
  const { data: clinicId, error } = await supabase.rpc('my_clinic_id')
  // The database out of reach is an error, not a reason to send a member away
  if (error) throw new Error('Could not check this login. Please try again.')
  if (typeof clinicId !== 'string') {
    redirect('/login?error=not-allowed')
  }

  return {
    id: claims.sub,
    email: claims.email!,
    clinicId,
  }
})

// The clinic the signed-in person works in. Its folder holds the clinic's photos, recordings and bills
// (src/lib/clinic-files.ts).
export const getClinicId = async (): Promise<string> => (await getDoctor()).clinicId
