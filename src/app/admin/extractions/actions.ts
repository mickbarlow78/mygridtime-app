'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export type ExtractionStatus =
  | 'success'
  | 'error'
  | 'rate_limited'
  | 'validation_failed'

export interface ExtractionLogEntry {
  id: string
  org_id: string
  user_id: string | null
  event_id: string | null
  source_mime: string
  source_bytes: number
  source_path: string | null
  model: string | null
  tokens_input: number | null
  tokens_output: number | null
  status: ExtractionStatus
  error_code: string | null
  created_at: string
  user_email: string | null
  event_title: string | null
  event_slug: string | null
  event_deleted: boolean
}

export interface LoadExtractionLogResult {
  entries: ExtractionLogEntry[]
  capped: boolean
}

const CAP = 2000

/**
 * Loads ai_extraction_log rows for an org, newest first. Mirrors the
 * shape of loadAuditLog() (DEC-026). RLS (`ai_extraction_log_select_members`)
 * is the real access gate — this action only requires an authenticated user.
 */
export async function loadExtractionLog(
  orgId: string,
): Promise<ActionResult<LoadExtractionLogResult>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: rows, error } = await supabase
    .from('ai_extraction_log')
    .select(
      'id, org_id, user_id, event_id, source_mime, source_bytes, source_path, model, tokens_input, tokens_output, status, error_code, created_at, users:user_id ( email ), events:event_id ( id, title, slug, deleted_at )',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(CAP + 1)

  if (error) {
    Sentry.captureException(error, {
      tags: { action: 'loadExtractionLog.select' },
    })
    return { success: false, error: 'Could not load extraction log. Please retry.' }
  }

  type Raw = {
    id: string
    org_id: string
    user_id: string | null
    event_id: string | null
    source_mime: string
    source_bytes: number
    source_path: string | null
    model: string | null
    tokens_input: number | null
    tokens_output: number | null
    status: ExtractionStatus
    error_code: string | null
    created_at: string
    users: { email: string } | null
    events: { id: string; title: string | null; slug: string | null; deleted_at: string | null } | null
  }

  const allRows: ExtractionLogEntry[] = (rows ?? []).map((row) => {
    const raw = row as unknown as Raw
    return {
      id: raw.id,
      org_id: raw.org_id,
      user_id: raw.user_id,
      event_id: raw.event_id,
      source_mime: raw.source_mime,
      source_bytes: raw.source_bytes,
      source_path: raw.source_path,
      model: raw.model,
      tokens_input: raw.tokens_input,
      tokens_output: raw.tokens_output,
      status: raw.status,
      error_code: raw.error_code,
      created_at: raw.created_at,
      user_email: raw.users?.email ?? null,
      event_title: raw.events?.title ?? null,
      event_slug: raw.events?.slug ?? null,
      event_deleted: raw.events?.deleted_at != null,
    }
  })

  const capped = allRows.length > CAP
  const entries = capped ? allRows.slice(0, CAP) : allRows

  return { success: true, data: { entries, capped } }
}
