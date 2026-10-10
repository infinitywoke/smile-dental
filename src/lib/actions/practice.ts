'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { PRACTICE_COOKIE } from '@/lib/practice'

export async function setPracticeMode(on: boolean): Promise<void> {
  await getDoctor()
  const store = await cookies()
  if (on) {
    store.set(PRACTICE_COOKIE, '1', { path: '/app', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 })
  } else {
    store.set(PRACTICE_COOKIE, '', { path: '/app', httpOnly: true, sameSite: 'lax', maxAge: 0 })
  }
  revalidatePath('/app', 'layout')
}
