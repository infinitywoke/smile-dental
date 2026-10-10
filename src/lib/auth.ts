import 'server-only'
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
export async function getDoctor(): Promise<Doctor> {
  // Session checks compare token expiry with the current time, so they must run at request time
  await connection()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }
  if (!isAllowedEmail(user.email)) {
    redirect('/login?error=not-allowed')
  }

  return {
    id: user.id,
    email: user.email!,
    name: (user.user_metadata?.full_name as string | undefined) ?? 'Dr. Rahil',
  }
}
