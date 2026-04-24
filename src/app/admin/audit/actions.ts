'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { AuditScope, AuditLogEntry } from '@/lib/audit'
import type { Json } from '@/lib/types/database'
import * as Sentry from '@sentry/nextjs'

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export interface LoadAuditLogResult {
  entries: AuditLogEntry[]
  capped: boolean
}

const CAP = 2000

/**
 * Scope-polymorphic audit log loader. Accepts either an event-scoped or
 * org-scoped `AuditScope` and returns up to `CAP` rows, newest first.
 *
 * RLS (`audit_log_select_admin`) is the real access gate for both
 * branches — this action only requires an authenticated user. Rows the
 * caller cannot see are silently filtered out by Postgres, consistent
 * with the rest of the admin read layer.
 *
 * Used by:
 *   - `AuditLogView` on `/admin/events/{id}` (via the backwards-compat
 *     `loadAllAuditLog(eventId)` delegator in events/actions.ts).
 *   - The forthcoming org-audit UI (org scope) — see DEC-026.
 */
export async function loadAuditLog(
  scope: AuditScope
): Promise<ActionResult<LoadAuditLogResult>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const scopeTag = 'eventId' in scope ? 'event' : 'championship'

  let query = supabase
    .from('audit_log')
    .select('*, users:user_id ( email )')
    .order('created_at', { ascending: false })
    .limit(CAP + 1)

  query = 'eventId' in scope
    ? query.eq('event_id', scope.eventId)
    : query.eq('championship_id', scope.championshipId)

  const { data: rows, error } = await query

  if (error) {
    Sentry.captureException(error, {
      tags: { action: 'loadAuditLog.select', scope: scopeTag },
    })
    return { success: false, error: 'Could not load audit log. Please retry.' }
  }

  type AuditRowRaw = {
    id: string
    user_id: string | null
    event_id: string | null
    championship_id: string | null
    action: string
    detail: unknown
    actor_context: unknown
    created_at: string
    users: { email: string } | null
  }

  const allRows: AuditLogEntry[] = (rows ?? []).map((row) => {
    const raw = row as unknown as AuditRowRaw
    return {
      id: raw.id,
      user_id: raw.user_id,
      event_id: raw.event_id,
      championship_id: raw.championship_id,
      action: raw.action,
      detail: raw.detail as Json | null,
      actor_context: raw.actor_context as Json | null,
      created_at: raw.created_at,
      user_email: raw.users?.email ?? null,
    }
  })

  const capped = allRows.length > CAP
  const entries = capped ? allRows.slice(0, CAP) : allRows

  return { success: true, data: { entries, capped } }
}
