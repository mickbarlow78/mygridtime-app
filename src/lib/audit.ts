import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/lib/types/database'

/**
 * Writes a row to the audit_log table.
 * Shared by events/actions.ts and templates/actions.ts.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  action: string,
  detail?: Record<string, unknown>
) {
  await supabase.from('audit_log').insert({
    user_id: userId,
    event_id: eventId,
    action,
    detail: (detail ?? null) as Json | null,
  })
}
