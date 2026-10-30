import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refreshes the Supabase session cookie and does a quick redirect check.
// This is an optimistic check only: pages and actions re-verify with getDoctor(), which also needs the login
// to be a member of a clinic.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Checked with the project's public signing key: no call to Supabase Auth unless the session needs refreshing
  const { data } = await supabase.auth.getClaims()
  const signedIn = !!data?.claims?.sub
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/app') && !signedIn) {
    // Remember where they were going (e.g. a booking request opened from WhatsApp)
    const login = new URL('/login', request.url)
    if (pathname !== '/app') login.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(login)
  }
  // Not sent back from /login?error=…: getDoctor sends a login with no clinic there, and it would go round forever
  if (pathname === '/login' && signedIn && !request.nextUrl.searchParams.has('error')) {
    return NextResponse.redirect(new URL('/app', request.url))
  }

  return response
}

export const config = {
  matcher: ['/app/:path*', '/login'],
}
