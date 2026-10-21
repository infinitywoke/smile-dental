'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getDoctor } from '@/lib/auth'
import { THEME_COOKIE, THEME_PREFS, type ThemePref } from '@/lib/theme'

// The look for this phone: kept in a cookie, so the first paint of every screen is already right
export async function setThemePreference(pref: ThemePref): Promise<{ ok: boolean }> {
  await getDoctor()
  if (!THEME_PREFS.includes(pref)) return { ok: false }
  ;(await cookies()).set(THEME_COOKIE, pref, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true })
  revalidatePath('/app', 'layout')
  return { ok: true }
}
