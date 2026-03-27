import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth session on every request.
 * Called from src/middleware.ts — Phase 2 only.
 *
 * IMPORTANT: Do not add any logic between createServerClient and
 * supabase.auth.getUser() — this pattern is required by @supabase/ssr.
 *
 * IMPORTANT: This function must never be imported by middleware.ts until
 * Phase 2 env vars (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
 * are confirmed present in the Netlify environment. @supabase/ssr throws
 * immediately inside createServerClient if the URL or key is falsy.
 */
export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'updateSession() called before Supabase env vars are configured. ' +
      'Do not import this function from middleware until Phase 2.'
    )
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — required to keep user logged in.
  await supabase.auth.getUser()

  return supabaseResponse
}
