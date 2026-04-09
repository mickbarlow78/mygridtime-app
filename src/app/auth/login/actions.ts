'use server'

import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/**
 * Send a magic-link sign-in email via a Server Action.
 *
 * WHY a Server Action instead of calling signInWithOtp() from the client:
 *   The emailRedirectTo URL must match exactly what is in Supabase's redirect
 *   URL allowlist. Any env-var-based approach (NEXT_PUBLIC_APP_URL, etc.) risks
 *   resolving to the wrong value — e.g. the Netlify deploy subdomain instead of
 *   the custom domain — causing Supabase to silently reject the redirect and
 *   fall back to the Site URL root, which lands the user on /?code= instead of
 *   /auth/callback?code=.
 *
 *   Reading the Host header server-side always gives the domain the browser
 *   actually sent the request to, so the redirect URL is always correct and
 *   always in the allowlist.
 *
 * PKCE flow:
 *   Calling signInWithOtp on the server client stores the PKCE code verifier
 *   in a cookie via the server client's setAll handler. Next.js server actions
 *   are permitted to write cookies, so the verifier is available when
 *   /auth/callback exchanges the code for a session.
 */
export async function sendMagicLink(email: string, next?: string): Promise<{ error: string | null }> {
  const headersList = headers()

  // host is always the domain the browser sent the request to:
  //   localhost:3000 in local dev
  //   app.mygridtime.com in production
  //   <branch>.mygridtime-app.netlify.app on preview deploys
  const host = headersList.get('host') ?? 'localhost:3000'

  // Localhost never has TLS; everything else does.
  const proto =
    host.startsWith('localhost') || host.startsWith('127.')
      ? 'http'
      : 'https'

  const emailRedirectTo = `${proto}://${host}/auth/callback`

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  })

  // If OTP was sent successfully and there's a return path, persist it in a
  // short-lived cookie. The auth callback reads and clears it after the code
  // exchange, then redirects there instead of /admin.
  // The emailRedirectTo URL stays as /auth/callback (no query params) so the
  // Supabase allowlist doesn't need to change.
  if (!error && next && next.startsWith('/') && !next.startsWith('//')) {
    try {
      cookies().set('mgt-login-next', next, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60, // 1 hour — matches Supabase magic link expiry
      })
    } catch {
      // Server Component context — cookie write not possible, non-fatal.
    }
  }

  return { error: error?.message ?? null }
}
