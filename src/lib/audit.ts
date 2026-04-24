import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorContext, Json, PlatformRole } from '@/lib/types/database'
import * as Sentry from '@sentry/nextjs'

/**
 * Pure helper — derives the Phase A actor_context audit payload from an
 * ActiveChampionship-style shape.  Kept pure so it can be unit-tested without
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
 * Discriminated-union scope for a single audit_log row.
 *
 * Exactly one branch must be set per row — enforced at the DB layer by
 * the `audit_log_scope_xor` CHECK constraint (migration
 * `20260417000000_org_audit_log.sql`). Callers choose the branch; the
 * helper never forges an `event_id` or `championship_id`. See DEC-025.
 */
export type AuditScope =
  | { eventId: string }
  | { championshipId: string }

/**
 * Shape of a single audit_log row as returned by the read layer.
 *
 * Lives alongside `AuditScope` (the write-side contract) so the
 * event-scoped loader in `src/app/admin/events/actions.ts` and the
 * scope-polymorphic `loadAuditLog()` in
 * `src/app/admin/audit/actions.ts` share one type source. See DEC-026.
 */
export interface AuditLogEntry {
  id: string
  user_id: string | null
  event_id: string | null
  championship_id: string | null
  action: string
  detail: Json | null
  actor_context: Json | null
  created_at: string
  user_email: string | null
}

/**
 * Writes a row to the audit_log table.
 * Shared by events/actions.ts, templates/actions.ts, and orgs/actions.ts.
 *
 * Hardened: never throws. Audit logging is a side-effect and must never
 * crash the calling action or flip its success/failure result. Any error
 * (Supabase error row or thrown exception) is reported to Sentry and
 * swallowed so the primary mutation remains the source of truth.
 *
 * Phase A: accepts an optional `actorContext` that is written to the
 * `audit_log.actor_context` column. When omitted, the column stays
 * NULL — read-side tooling should treat NULL as legacy / unknown.
 *
 * MGT-055: `scope` is a discriminated union of `{ eventId }` or
 * `{ championshipId }`. The row writes `event_id` or `championship_id` accordingly; the
 * other column is NULL. Always uses the caller's authenticated Supabase
 * client — no admin-client fallback. See DEC-025.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  userId: string,
  scope: AuditScope,
  action: string,
  detail?: Record<string, unknown>,
  actorContext?: ActorContext
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log').insert({
      user_id: userId,
      event_id: 'eventId' in scope ? scope.eventId : null,
      championship_id: 'championshipId' in scope ? scope.championshipId : null,
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
