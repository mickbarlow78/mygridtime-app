'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { acceptInvite } from '@/app/admin/orgs/actions'
import { CARD, CONTAINER_AUTH, BTN_PRIMARY, ERROR_BANNER, SUCCESS_BANNER } from '@/lib/styles'

interface AcceptInviteFormProps {
  token: string
}

export function AcceptInviteForm({ token }: AcceptInviteFormProps) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'accepting' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  // MGT-084: invites now only grant 'editor'; all accepted invites land on /admin.
  const destination = '/admin'

  async function handleAccept() {
    setStatus('accepting')
    setError(null)

    const result = await acceptInvite(token)

    if (!result.success) {
      setError(result.error)
      setStatus('error')
      return
    }

    setStatus('success')
    setTimeout(() => router.push(destination), 1500)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className={CONTAINER_AUTH}>
        <div className={`${CARD} p-6 text-center space-y-4`}>
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>

          <div>
            <h1 className="text-lg font-semibold text-gray-900">Organisation invite</h1>
            <p className="text-sm text-gray-500 mt-1">
              You have been invited to join an organisation on MyGridTime.
            </p>
          </div>

          {status === 'idle' && (
            <button
              onClick={handleAccept}
              className={`w-full ${BTN_PRIMARY}`}
            >
              Accept invitation
            </button>
          )}

          {status === 'accepting' && (
            <p className="text-sm text-gray-500">Accepting invitation...</p>
          )}

          {status === 'success' && (
            <div className="space-y-3">
              <p className={SUCCESS_BANNER}>
                Invitation accepted! Redirecting…
              </p>
              {/* Manual fallback — if the automatic redirect does not land
                  cleanly (blocked navigation, slow client-side routing, etc.)
                  the user can click through manually instead of being stranded
                  on this page. */}
              <Link
                href={destination}
                className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 transition-colors inline-block"
              >
                Continue to admin
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <p className={ERROR_BANNER}>
                {error}
              </p>
              <button
                onClick={() => { setStatus('idle'); setError(null) }}
                className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          <span className="font-semibold tracking-tight">MyGridTime</span>
        </p>
      </div>
    </div>
  )
}
