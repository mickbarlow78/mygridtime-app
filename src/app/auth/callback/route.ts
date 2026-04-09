import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Auth callback — server-side PKCE code exchange.
 *
 * WHY a Route Handler, not a page.tsx with client-side exchange:
 *   The PKCE code verifier is stored as an HTTP cookie by @supabase/ssr's
 *   browser client when signInWithOtp() is called on the login page.
 *   On the callback request, the browser sends that cookie in the HTTP
 *   request headers. A server-side Route Handler reads those headers via
 *   request.cookies and can write new Set-Cookie headers onto the response.
 *   A client-side useEffect approach ALSO reads document.cookie — but only
 *   after the page has fully hydrated, by which point Next.js may have
 *   already reloaded the supabase client singleton and cleared its internal
 *   storage state, causing the "PKCE code verifier not found" error.
 *
 * Flow:
 *   1. User clicks magic link → Supabase verifies → redirects here with ?code=
 *   2. createServerClient reads the verifier from request cookies
 *   3. exchangeCodeForSession(code) exchanges code + verifier for tokens
 *   4. setAll() writes session cookies onto the redirect response
 *   5. Browser follows redirect to /admin with valid session cookies
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  // Surface any error Supabase appended to the redirect URL
  const urlError = searchParams.get('error')
  const urlErrorDescription = searchParams.get('error_description')
  if (urlError) {
    const loginUrl = new URL('/auth/login', origin)
    loginUrl.searchParams.set('error', urlErrorDescription ?? urlError)
    return NextResponse.redirect(loginUrl)
  }

  const code = searchParams.get('code')

  if (!code) {
    const loginUrl = new URL('/auth/login', origin)
    loginUrl.searchParams.set(
      'error',
      'Sign-in link is missing or has already been used. Please request a new one.'
    )
    return NextResponse.redirect(loginUrl)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    const loginUrl = new URL('/auth/login', origin)
    loginUrl.searchParams.set('error', 'Authentication is not configured.')
    return NextResponse.redirect(loginUrl)
  }

  // Read the return-path cookie set by sendMagicLink (invite flow only).
  // Validate it is a relative path to prevent open-redirect attacks.
  const rawNext = request.cookies.get('mgt-login-next')?.value ?? null
  const safeNext =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : null

  // Collect session cookies during code exchange so they can be written onto
  // whatever redirect response we build after determining the destination.
  const pendingCookies: Array<{ name: string; value: string; options: CookieOptions }> = []

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        // Read the incoming request cookies — this is where the PKCE verifier lives.
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        // Collect for now; written to successResponse once destination is known.
        pendingCookies.push(...cookiesToSet)
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    const loginUrl = new URL('/auth/login', origin)
    loginUrl.searchParams.set('error', error.message)
    return NextResponse.redirect(loginUrl)
  }

  // Determine the redirect destination.
  // If a return-path cookie was set (invite flow), honour it — the invite page
  // handles its own viewer routing after accept.
  // For a plain login with no return path, check the user's highest org role:
  // viewer-only users cannot access /admin and are sent to the public landing.
  let destination = safeNext ?? '/admin'

  if (!safeNext) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: memberships } = await supabase
        .from('org_members')
        .select('role')
        .eq('user_id', user.id)

      const roles = (memberships ?? []).map((m) => m.role)
      const hasElevatedRole = roles.some((r) =>
        ['owner', 'admin', 'editor'].includes(r)
      )
      if (!hasElevatedRole) {
        // Viewer-only (or no org yet) — send to the public landing page.
        destination = '/'
      }
    }
  }

  // Use NEXT_PUBLIC_APP_URL as the redirect base when set so the final URL is
  // always on the canonical domain, not a Netlify preview host. Falls back to
  // origin (the domain this callback was served from) when the var is absent.
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? origin

  // Build the success redirect and write all collected session cookies onto it.
  const successResponse = NextResponse.redirect(new URL(destination, appOrigin))
  pendingCookies.forEach(({ name, value, options }) => {
    successResponse.cookies.set(name, value, options)
  })

  // Clear the next cookie so it isn't reused on a subsequent login.
  if (safeNext) {
    successResponse.cookies.delete('mgt-login-next')
  }

  return successResponse
}
