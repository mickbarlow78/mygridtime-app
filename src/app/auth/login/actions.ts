'use server'

import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/**
 * Send a magic-link sign-in email via a Server Action.
 *
 * WHY a Server Action instead of calling signInWithOtp() from the client:
 *   The emailRedirectTo URL must match what is in Supabase's redirect allowlist.
 *   Building this on the server gives us access to both the canonical app URL
 *   (NEXT_PUBLIC_APP_URL) and the request Host header as a reliable fallback.
 *
 * Domain strategy:
 *   1. NEXT_PUBLIC_APP_URL is set (production) → use it. This is the canonical
 *      domain, always in the Supabase allowlist. Using the Host header on preview
 *      deploys produces a URL Supabase doesn't recognise; it silently falls back
 *      to its Site URL root and appends ?code= there, so the callback is never
 *      reached and the code is never exchanged.
 *   2. NEXT_PUBLIC_APP_URL is not set (local dev, preview deploys) → derive from
 *      the Host header as before. Supabase allowlist must include these origins
 *      (e.g. http://localhost:3000/** or a wildcard for preview URLs).
 *
 * PKCE flow:
 *   Calling signInWithOtp on the server client stores the PKCE code verifier
 *   in a cookie via the server client's setAll handler. Next.js server actions
 *   are permitted to write cookies, so the verifier is available when
 *   /auth/callback exchanges the code for a session.
 */
export async function sendMagicLink(email: string, next?: string): Promise<{ error: string | null }> {
  const headersList = headers()

  // Priority 1: canonical app URL (production). Strip any trailing slash.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')

  // Priority 2: host-derived URL (local dev / preview without APP_URL).
  const host = headersList.get('host') ?? 'localhost:3000'
  const proto =
    host.startsWith('localhost') || host.startsWith('127.')
      ? 'http'
      : 'https'

  const emailRedirectTo = appUrl
    ? `${appUrl}/auth/callback`
    : `${proto}://${host}/auth/callback`

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
