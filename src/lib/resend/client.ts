import { Resend } from 'resend'

/**
 * Returns a cached Resend client, or null if RESEND_API_KEY is not set.
 *
 * Returning null (rather than throwing) lets the app run in environments
 * without Resend configured — notification sends are skipped gracefully
 * instead of crashing the action that triggered them.
 */
let _client: Resend | null = null

export function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!_client) _client = new Resend(process.env.RESEND_API_KEY)
  return _client
}

/**
 * The verified sender address.  Must be set in Netlify env vars.
 * Falls back to a safe default so TypeScript callers don't need to guard.
 */
export function getFromAddress(): string {
  return process.env.EMAIL_FROM ?? 'noreply@mygridtime.com'
}
