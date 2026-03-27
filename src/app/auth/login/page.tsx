'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Supabase redirects here after the user clicks the magic link.
        // Must match an allowed URL in your Supabase project's Auth settings.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (otpError) {
      setError(otpError.message)
      setLoading(false)
      return
    }

    setSubmitted(true)
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm w-full bg-white rounded-lg border border-gray-200 shadow-sm px-8 py-10 text-center">
          <div className="text-3xl mb-4">✉️</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h1>
          <p className="text-sm text-gray-500">
            We sent a sign-in link to{' '}
            <span className="font-medium text-gray-700">{email}</span>.
          </p>
          <p className="text-xs text-gray-400 mt-4">
            Didn&apos;t arrive? Check your spam folder. The link expires in 1 hour.
          </p>
          <button
            onClick={() => { setSubmitted(false); setEmail('') }}
            className="mt-6 text-xs text-gray-500 underline hover:text-gray-700"
          >
            Try a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full bg-white rounded-lg border border-gray-200 shadow-sm px-8 py-10">
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Sign in to MyGridTime</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter your email to receive a sign-in link. No password needed.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md
                         focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent
                         disabled:bg-gray-50 disabled:text-gray-400"
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full py-2 px-4 bg-gray-900 text-white text-sm font-medium rounded-md
                       hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors duration-150"
          >
            {loading ? 'Sending…' : 'Send sign-in link'}
          </button>
        </form>
      </div>
    </div>
  )
}
