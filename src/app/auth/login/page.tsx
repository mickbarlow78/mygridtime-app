'use client'

import { sendMagicLink } from './actions'
import { useEffect, useState } from 'react'
import { CARD, CONTAINER_AUTH, LABEL, INPUT, BTN_PRIMARY, ERROR_BANNER } from '@/lib/styles'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [next, setNext] = useState<string | null>(null)

  // Read ?error= and ?next= from the URL after mount.
  // Avoids useSearchParams() + Suspense, which prevents useState setters
  // from committing during the Suspense hydration cycle.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlError = params.get('error')
    if (urlError) setError(decodeURIComponent(urlError))
    const urlNext = params.get('next')
    if (urlNext) setNext(urlNext)
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: otpError } = await sendMagicLink(email, next ?? undefined)

    if (otpError) {
      const isRateLimit = /rate limit/i.test(otpError)
      setError(
        isRateLimit
          ? 'Too many sign-in emails were requested. Please wait a few minutes before trying again.'
          : otpError
      )
      setLoading(false)
      return
    }

    setSubmitted(true)
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className={`${CONTAINER_AUTH} ${CARD} shadow-sm px-8 py-10 text-center`}>
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
            onClick={() => { setSubmitted(false); setEmail(''); setError(null) }}
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
      <div className={`${CONTAINER_AUTH} ${CARD} shadow-sm px-8 py-10`}>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Sign in to MyGridTime</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter your email to receive a sign-in link. No password needed.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className={LABEL}
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
              className={`${INPUT} disabled:bg-gray-50 disabled:text-gray-400`}
              disabled={loading}
            />
          </div>

          {error && (
            <p className={ERROR_BANNER}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className={`w-full ${BTN_PRIMARY} disabled:cursor-not-allowed`}
          >
            {loading ? 'Sending…' : 'Send sign-in link'}
          </button>
        </form>
      </div>
    </div>
  )
}
