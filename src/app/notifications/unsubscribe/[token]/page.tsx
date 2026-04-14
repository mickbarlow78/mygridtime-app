import { lookupByToken } from '../actions'
import UnsubscribeForm from './UnsubscribeForm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Notification Preferences',
}

interface Props {
  params: Promise<{ token: string }>
}

export default async function UnsubscribePage({ params }: Props) {
  const { token } = await params
  const pref = await lookupByToken(token)

  if (!pref) {
    return (
      <div style={{
        maxWidth: 440,
        margin: '80px auto',
        padding: 32,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#111827' }}>
          Invalid Link
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280' }}>
          This unsubscribe link is invalid or has expired.
        </p>
        <p style={{ marginTop: 32, fontSize: 12, color: '#9ca3af' }}>
          MyGridTime
        </p>
      </div>
    )
  }

  return (
    <UnsubscribeForm
      token={token}
      maskedEmail={pref.maskedEmail}
      initialUnsubscribed={pref.unsubscribed}
    />
  )
}
