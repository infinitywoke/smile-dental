import 'server-only'
import { cookies } from 'next/headers'

// Practice mode: while on, every new patient is marked TEST so trial entries
// can be cleared in one go. Kept in a cookie on this phone, not in the database.
export const PRACTICE_COOKIE = 'practice_mode'

export async function isPracticeMode(): Promise<boolean> {
  return (await cookies()).get(PRACTICE_COOKIE)?.value === '1'
}
