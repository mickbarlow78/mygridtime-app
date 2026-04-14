import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Phase 2: Session refresh on every request + /admin/* route protection.
 *
 * Pattern required by @supabase/ssr:
 *   - Create the server client with cookie read/write on the request/response.
 *   - Call getUser() — this refreshes the session token if it has expired.
 *   - Forward the mutated response (with any updated Set-Cookie headers).
 *
 * IMPORTANT: Do not use supabase.auth.getSession() here — it reads from the
 * cookie without verifying with the auth server. Always use getUser().
 */
export async function middleware(request: NextRequest) {
  // Defensive guard — Phase 1 pass-through if env vars are absent.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next()
  }

  // Forward the current pathname as a header so Server Components (e.g. the
  // admin layout) can branch on the route — Next.js does not expose the
  // pathname to Server Components directly.
  //
  // NOTE: `request.headers` is immutable in Next.js middleware. Build a fresh
  // Headers copy, mutate that, and hand it back via NextResponse.next({
  // request: { headers: requestHeaders } }) so the forwarded request carries
  // x-pathname downstream.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          // Write updated cookies back onto both the request and the response.
          // Both mutations are required by @supabase/ssr. The x-pathname
          // header is preserved on the rebuilt response because we keep
          // passing the same requestHeaders copy.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() validates the JWT with Supabase Auth and refreshes if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Redirect unauthenticated requests to /admin/* → /auth/login
  if (!user && request.nextUrl.pathname.startsWith('/admin')) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    return NextResponse.redirect(loginUrl)
  }

  // If user is authenticated and hits /auth/login, send them to /admin
  if (user && request.nextUrl.pathname === '/auth/login') {
    const adminUrl = request.nextUrl.clone()
    adminUrl.pathname = '/admin'
    return NextResponse.redirect(adminUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static  (static assets)
     * - _next/image   (image optimisation)
     * - favicon.ico, icons/, manifest.json, sw.js (public assets)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icons|manifest\\.json|sw\\.js).*)',
  ],
}
