import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Handles the Supabase magic link auth callback.
 *
 * Flow:
 *  1. User clicks magic link in email.
 *  2. Supabase verifies the token and redirects here with ?code=<pkce_code>.
 *  3. This Server Component exchanges the code for a session (sets cookies).
 *  4. Redirects to /admin on success, or /auth/login on failure.
 *
 * Using a Server Component (not a Route Handler) is valid in Next.js 14.2+:
 * cookies set during render are included in the redirect response.
 */
interface Props {
  searchParams: {
    code?: string
    error?: string
    error_description?: string
  }
}

export default async function AuthCallbackPage({ searchParams }: Props) {
  const { code, error, error_description } = searchParams

  if (error) {
    const message = encodeURIComponent(error_description ?? error)
    redirect(`/auth/login?error=${message}`)
  }

  if (code) {
    const supabase = createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (!exchangeError) {
      redirect('/admin')
    }
  }

  // No code provided or exchange failed — back to login
  redirect('/auth/login?error=Sign-in+link+invalid+or+expired.+Please+try+again.')
}
