import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Phase 2: Route protection added here.
  // /admin/* routes will redirect to /auth/login if no valid session.
  return await updateSession(request)
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
