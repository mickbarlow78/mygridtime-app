import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorContext, Json, PlatformRole } from '@/lib/types/database'
import * as Sentry from '@sentry/nextjs'

/**
 * Pure helper — derives the Phase A actor_context audit payload from an
 * ActiveOrg-style shape.  Kept pure so it can be unit-tested without
 * touching Supabase and re-used by any server action that needs to
 * stamp audit rows with the correct actor provenance.
 *
 * `via` discriminates between a genuine customer org member
 * (`'membership'`) and a platform staff user who reached the org via
 * the Phase A compatibility shortcut (`'platform'`). The distinction
 * is preserved in the audit trail so reviewers can tell the two cases
 * apart — platform-reached access must never be reported as customer
 * org ownership.
 */
export function makeActorContext(source: {
  via: 'platform' | 'membership'
  platform_role?: PlatformRole | null
}): ActorContext {
  if (source.via === 'platform') {
    return {
      via: 'platform',
      platform_role: source.platform_role ?? null,
    }
  }
  return { via: 'membership' }
}

/**
 * Writes a row to the audit_log table.
 * Shared by events/actions.ts and templates/actions.ts.
 *
 * Hardened: never throws. Audit logging is a side-effect and must never
 * crash the calling action or flip its success/failure result. Any error
 * (Supabase error row or thrown exception) is reported to Sentry and
 * swallowed so the primary mutation remains the source of truth.
 *
 * Phase A: accepts an optional `actorContext` that is written to the
 * `audit_log.actor_context` column. When omitted, the column stays
 * NULL — read-side tooling should treat NULL as legacy / unknown.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  action: string,
  detail?: Record<string, unknown>,
  actorContext?: ActorContext
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log').insert({
      user_id: userId,
      event_id: eventId,
      action,
      detail: (detail ?? null) as Json | null,
      actor_context: (actorContext ?? null) as unknown as Json | null,
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
