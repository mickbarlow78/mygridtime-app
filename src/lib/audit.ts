import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/lib/types/database'
import * as Sentry from '@sentry/nextjs'

/**
 * Writes a row to the audit_log table.
 * Shared by events/actions.ts and templates/actions.ts.
 *
 * Hardened: never throws. Audit logging is a side-effect and must never
 * crash the calling action or flip its success/failure result. Any error
 * (Supabase error row or thrown exception) is reported to Sentry and
 * swallowed so the primary mutation remains the source of truth.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  action: string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log').insert({
      user_id: userId,
      event_id: eventId,
      action,
      detail: (detail ?? null) as Json | null,
    })
    if (error) {
      Sentry.captureException(
        new Error(`writeAuditLog failed: ${error.message}`),
        { tags: { helper: 'writeAuditLog', action } }
      )
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { helper: 'writeAuditLog', action },
    })
  }
}
