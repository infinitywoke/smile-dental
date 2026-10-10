'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmail } from '@/lib/allowed-email'

// Only paths inside Clinic OS are allowed, so a sign-in link can't send the doctor elsewhere
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === 'string' ? value : ''
  return /^\/app(\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?]*)?$/.test(next) && !next.includes('//') ? next : '/app'
}

export async function signIn(formData: FormData) {
  const next = safeNext(formData.get('next'))
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!isAllowedEmail(email)) {
    redirect('/login?error=invalid')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect('/login?error=invalid')
  }
  redirect(next)
}
