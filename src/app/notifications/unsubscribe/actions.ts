'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type UnsubscribeState = {
  email: string | null
  unsubscribed: boolean
  error: string | null
}

/** Mask an email: j***@example.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  return `${local[0]}***@${domain}`
}

/** Look up a preference by token. Returns null if invalid. */
export async function lookupByToken(token: string): Promise<{
  maskedEmail: string
  unsubscribed: boolean
} | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('notification_preferences')
    .select('email, unsubscribed')
    .eq('token', token)
    .maybeSingle()

  if (!data) return null
  return {
    maskedEmail: maskEmail(data.email),
    unsubscribed: data.unsubscribed,
  }
}

/** Toggle unsubscribe state for a token. */
export async function toggleUnsubscribe(
  token: string,
  unsubscribe: boolean
): Promise<UnsubscribeState> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('notification_preferences')
    .update({
      unsubscribed: unsubscribe,
      updated_at: new Date().toISOString(),
    })
    .eq('token', token)
    .select('email, unsubscribed')
    .maybeSingle()

  if (error || !data) {
    return { email: null, unsubscribed: false, error: 'Something went wrong. Please try again.' }
  }

  return {
    email: maskEmail(data.email),
    unsubscribed: data.unsubscribed,
    error: null,
  }
}
