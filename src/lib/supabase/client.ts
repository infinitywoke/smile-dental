import { createBrowserClient } from '@supabase/ssr'

// Browser client, used only to upload visit photos straight to Storage.
// It acts as the signed-in user, so Storage rules still apply.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
