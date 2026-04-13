import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Dev-only auto-login route.
 *
 * Creates a real Supabase session for DEV_ADMIN_EMAIL without sending an email.
 * Uses the admin client to generate a magic-link token, then exchanges it
 * server-side via verifyOtp to produce real session cookies.
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

  // ── Generate magic-link token via admin client (no email sent) ─────────
  const admin = createAdminClient()

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({ type: 'magiclink', email })

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { error: linkError?.message ?? 'Failed to generate link' },
      { status: 500 },
    )
  }

  // ── Exchange the token for a real session ───────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Collect cookies written during verifyOtp so we can set them on the
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

  const { error: otpError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  })

  if (otpError) {
    return NextResponse.json(
      { error: otpError.message },
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
