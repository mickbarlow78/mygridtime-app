import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Dev-only auto-login route.
 *
 * Creates a real Supabase session for DEV_ADMIN_EMAIL without sending an email.
 * Sets a one-shot random password on the admin user via the service-role
 * client, then signs in with that password through an @supabase/ssr client so
 * the cookie adapter writes real sb-* session cookies onto the redirect.
 *
 * Hard-gated on NODE_ENV === 'development' — returns 404 in all other environments.
 * See DEC-010.
 */
export async function GET(request: NextRequest) {
  // ── Hard gate: development only ────────────────────────────────────────
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse(null, { status: 404 })
  }

  const email = process.env.DEV_ADMIN_EMAIL
  if (!email) {
    return NextResponse.json(
      { error: 'DEV_ADMIN_EMAIL is not set in .env.local' },
      { status: 500 },
    )
  }

  // ── Mint a session for DEV_ADMIN_EMAIL ─────────────────────────────────
  // Strategy: set a one-shot random password on the admin user via the
  // service-role client, then sign in with password. Admin-minted magic-link
  // hashes cannot be redeemed through @supabase/ssr (which forces PKCE flow),
  // so password sign-in is the reliable server-side path in dev.
  const admin = createAdminClient()

  const { data: lookup, error: lookupError } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (lookupError || !lookup?.id) {
    return NextResponse.json(
      { error: lookupError?.message ?? `No user row for ${email}` },
      { status: 500 },
    )
  }

  const tempPassword = `dev-${crypto.randomUUID()}`
  const { error: updateError } = await admin.auth.admin.updateUserById(
    lookup.id,
    { password: tempPassword },
  )
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Collect cookies written during sign-in so we can set them on the
  // redirect response — same pattern as the production auth callback.
  const pendingCookies: Array<{
    name: string
    value: string
    options: CookieOptions
  }> = []

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(
        cookiesToSet: Array<{
          name: string
          value: string
          options: CookieOptions
        }>,
      ) {
        pendingCookies.push(...cookiesToSet)
      },
    },
  })

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: tempPassword,
  })

  if (signInError) {
    return NextResponse.json(
      { error: signInError.message },
      { status: 500 },
    )
  }

  // ── Redirect to /admin with real session cookies ───────────────────────
  const { origin } = new URL(request.url)
  const response = NextResponse.redirect(new URL('/admin', origin))
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })

  return response
}
