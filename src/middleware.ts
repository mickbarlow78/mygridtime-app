import { NextResponse, type NextRequest } from 'next/server'

/**
 * Phase 1: Pure pass-through. No Supabase dependency.
 *
 * Phase 2 will replace this with:
 *   import { updateSession } from '@/lib/supabase/middleware'
 *   ...and add route protection for /admin/* → /auth/login
 *
 * Supabase must NOT be imported here until Phase 2 env vars are configured —
 * the Netlify edge runtime can invoke this before env vars are available,
 * and @supabase/ssr throws at createServerClient() call time if URL/key are falsy.
 */
export async function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico, icons/, manifest.json, sw.js (public assets)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icons|manifest\\.json|sw\\.js).*)',
  ],
}
