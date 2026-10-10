import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// A client for what visitors may do without signing in. It carries no session, so it only
// reaches the narrow public functions (open booking times, submit a request).
// `clientIp` is passed on so the database can rate-limit each visitor separately.
export function createPublicClient(clientIp?: string | null) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: clientIp ? { headers: { 'x-forwarded-for': clientIp } } : undefined,
    }
  )
}
