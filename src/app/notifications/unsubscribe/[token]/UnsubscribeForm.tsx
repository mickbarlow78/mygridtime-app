'use client'

import { useState, useTransition } from 'react'
import { toggleUnsubscribe } from '../actions'

interface Props {
  token: string
  maskedEmail: string
  initialUnsubscribed: boolean
}

export default function UnsubscribeForm({ token, maskedEmail, initialUnsubscribed }: Props) {
  const [unsubscribed, setUnsubscribed] = useState(initialUnsubscribed)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    const newState = !unsubscribed
    startTransition(async () => {
      const result = await toggleUnsubscribe(token, newState)
      if (result.error) {
        setMessage(result.error)
      } else {
        setUnsubscribed(result.unsubscribed)
        setMessage(
          result.unsubscribed
            ? 'You have been unsubscribed from notifications.'
            : 'You have been re-subscribed to notifications.'
        )
      }
    })
  }

  return (
    <div style={{
      maxWidth: 440,
      margin: '80px auto',
      padding: 32,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#111827' }}>
        Notification Preferences
      </h1>

      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
        Managing notifications for <strong>{maskedEmail}</strong>
      </p>

      <p style={{ fontSize: 15, color: '#374151', marginBottom: 24 }}>
        {unsubscribed
          ? 'You are currently unsubscribed from event notifications.'
          : 'You are currently subscribed to event notifications.'}
      </p>

      <button
        onClick={handleToggle}
        disabled={isPending}
        style={{
          padding: '10px 24px',
          fontSize: 14,
          fontWeight: 600,
          color: '#fff',
          background: unsubscribed ? '#111827' : '#dc2626',
          border: 'none',
          borderRadius: 6,
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending
          ? 'Updating...'
          : unsubscribed
            ? 'Re-subscribe'
            : 'Unsubscribe'}
      </button>

      {message && (
        <p style={{ marginTop: 16, fontSize: 14, color: '#059669' }}>
          {message}
        </p>
      )}

      <p style={{ marginTop: 32, fontSize: 12, color: '#9ca3af' }}>
        MyGridTime
      </p>
    </div>
  )
}
