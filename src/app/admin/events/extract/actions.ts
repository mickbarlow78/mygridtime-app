'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getActiveOrg } from '@/lib/utils/active-org'
import { writeAuditLog, makeActorContext } from '@/lib/audit'
import {
  MOCK_EXTRACTED_EVENT,
  truncateExtractedEvent,
  extractWithClaude,
  ExtractValidationError,
  type ExtractedEvent,
  type ExtractedDay,
  type ExtractSupportedMime,
} from '@/lib/ai/extract'
import { countDaysInRange, MAX_EVENT_DAYS } from '@/lib/utils/slug'
import * as Sentry from '@sentry/nextjs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export interface ExtractionMeta {
  source_mime: string
  source_bytes: number
  /** Phase A / disabled-flag marker. Absent for real Claude responses. */
  mock?: true
  /** Phase B — ai_extraction_log row id; used to link the event back on save. */
  extraction_id?: string
  /** Phase B — model id returned by Anthropic SDK. */
  model?: string
  tokens_input?: number
  tokens_output?: number
  /** MGT-072 — true if user edited any field in the review step before create. Log-only. */
  was_modified?: boolean
}

export interface ExtractEventFromUploadResult {
  event: ExtractedEvent
  meta: ExtractionMeta
}

// ---------------------------------------------------------------------------
// Internal helpers (mirrored from events/templates actions)
// ---------------------------------------------------------------------------

async function requireUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return { supabase, user }
}

async function requireEditor() {
  const { supabase, user } = await requireUser()
  const membership = await getActiveOrg(supabase, user.id)
  return { supabase, user, membership }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = new Set<string>([
  'application/pdf',
  'image/png',
  'image/jpeg',
])

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

/** Matches the generic error convention from MGT-023 → MGT-029. */
const GENERIC_EXTRACT_ERROR = 'Could not process that upload. Please retry.'

const RATE_LIMIT_ERROR = 'Daily extraction limit reached. Please try again tomorrow.'

const EXTRACTIONS_PER_ORG_PER_DAY = 20

const STORAGE_BUCKET = 'event-extractions'

function isExtractionEnabled(): boolean {
  const v = process.env.MGT_AI_EXTRACTION_ENABLED?.toLowerCase().trim()
  return v === 'true' || v === '1' || v === 'yes'
}

function extForMime(mime: string): 'pdf' | 'png' | 'jpg' {
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'image/png') return 'png'
  return 'jpg'
}

// ---------------------------------------------------------------------------
// extractEventFromUpload
// ---------------------------------------------------------------------------

/**
 * Validates an uploaded PDF/PNG/JPG and returns a structured ExtractedEvent.
 *
 * When MGT_AI_EXTRACTION_ENABLED is false (default), returns the hardcoded
 * MOCK_EXTRACTED_EVENT so preview/staging environments still demo the UX
 * without an API key or credit cost.
 *
 * When enabled, runs:
 *   1. rate-limit pre-flight (20/org/24h, counted from ai_extraction_log)
 *   2. upload bytes to the private `event-extractions` bucket
 *   3. Claude Vision tool-use call (extractWithClaude)
 *   4. isExtractedEvent guard on the model response
 *   5. ai_extraction_log row with status + tokens + source_path
 *
 * Every failure path writes a log row so rate-limit counts, retries, and
 * observability stay accurate. User-facing errors stay generic.
 */
export async function extractEventFromUpload(
  formData: FormData
): Promise<ActionResult<ExtractEventFromUploadResult>> {
  const { membership } = await requireEditor()
  if (!membership) {
    return { success: false, error: 'You do not have permission to create events.' }
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    Sentry.captureException(new Error('extractEventFromUpload: no file in FormData'), {
      tags: { action: 'extractEventFromUpload.missingFile' },
    })
    return { success: false, error: GENERIC_EXTRACT_ERROR }
  }

  // Server-side MIME re-check (client may have been bypassed).
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    Sentry.captureException(
      new Error(`extractEventFromUpload: invalid MIME ${file.type}`),
      { tags: { action: 'extractEventFromUpload.invalidMime' } }
    )
    return { success: false, error: GENERIC_EXTRACT_ERROR }
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    Sentry.captureException(
      new Error(`extractEventFromUpload: oversize ${file.size} bytes`),
      { tags: { action: 'extractEventFromUpload.oversize' } }
    )
    return { success: false, error: GENERIC_EXTRACT_ERROR }
  }

  if (file.size === 0) {
    Sentry.captureException(new Error('extractEventFromUpload: empty file'), {
      tags: { action: 'extractEventFromUpload.empty' },
    })
    return { success: false, error: GENERIC_EXTRACT_ERROR }
  }

  // Flag off → keep serving the mock so preview envs still demo the UX.
  if (!isExtractionEnabled()) {
    await new Promise((r) => setTimeout(r, 800))
    return {
      success: true,
      data: {
        event: truncateExtractedEvent(MOCK_EXTRACTED_EVENT),
        meta: { source_mime: file.type, source_bytes: file.size, mock: true },
      },
    }
  }

  const { user } = await requireUser()
  const admin = createAdminClient()
  const orgId = membership.org_id
  const mime = file.type as ExtractSupportedMime

  // 1. Rate-limit pre-flight (rolling 24h window).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recentCount, error: countErr } = await admin
    .from('ai_extraction_log')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'success')
    .gte('created_at', since)

  if (countErr) {
    Sentry.captureException(countErr, { tags: { action: 'extractEventFromUpload.rateLimitCount' } })
    return { success: false, error: GENERIC_EXTRACT_ERROR }
  }

  if ((recentCount ?? 0) >= EXTRACTIONS_PER_ORG_PER_DAY) {
    await admin.from('ai_extraction_log').insert({
      org_id: orgId,
      user_id: user.id,
      source_mime: file.type,
      source_bytes: file.size,
      status: 'rate_limited',
    })
    return { success: false, error: RATE_LIMIT_ERROR }
  }

  // 2. Upload to private bucket for audit/replay.
  const extractionId = crypto.randomUUID()
  const ts = Date.now()
  const storagePath = `${orgId}/${extractionId}/${ts}.${extForMime(file.type)}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false })

  if (uploadErr) {
    Sentry.captureException(uploadErr, { tags: { action: 'extractEventFromUpload.storageUpload' } })
    await admin.from('ai_extraction_log').insert({
      org_id: orgId,
      user_id: user.id,
      source_mime: file.type,
      source_bytes: file.size,
      status: 'error',
      error_code: 'storage_upload_failed',
    })
    return { success: false, error: GENERIC_EXTRACT_ERROR }
  }

  // 3 + 4. Call Claude Vision with guard.
  try {
    const result = await extractWithClaude({ bytes, mime })

    // 5. Success log row — same id as the meta.extraction_id we return.
    const { error: logErr } = await admin.from('ai_extraction_log').insert({
      id: extractionId,
      org_id: orgId,
      user_id: user.id,
      source_mime: file.type,
      source_bytes: file.size,
      source_path: storagePath,
      model: result.model,
      tokens_input: result.tokens_input,
      tokens_output: result.tokens_output,
      status: 'success',
    })
    if (logErr) {
      Sentry.captureException(logErr, { tags: { action: 'extractEventFromUpload.logInsert' } })
      // Do not fail the user-facing path — extraction itself worked.
    }

    return {
      success: true,
      data: {
        event: truncateExtractedEvent(result.event),
        meta: {
          source_mime: file.type,
          source_bytes: file.size,
          extraction_id: extractionId,
          model: result.model,
          tokens_input: result.tokens_input,
          tokens_output: result.tokens_output,
        },
      },
    }
  } catch (err) {
    const isValidation = err instanceof ExtractValidationError
    Sentry.captureException(err, {
      tags: {
        action: isValidation
          ? 'extractEventFromUpload.validationFailed'
          : 'extractEventFromUpload.claudeError',
      },
      extra: { extractionId },
    })
    await admin.from('ai_extraction_log').insert({
      id: extractionId,
      org_id: orgId,
      user_id: user.id,
      source_mime: file.type,
      source_bytes: file.size,
      source_path: storagePath,
      status: isValidation ? 'validation_failed' : 'error',
      error_code: isValidation ? 'schema_mismatch' : 'claude_call_failed',
    })
    return { success: false, error: GENERIC_EXTRACT_ERROR }
  }
}

// ---------------------------------------------------------------------------
// saveExtractedEventContent
// ---------------------------------------------------------------------------

/**
 * Replaces the auto-created blank event_days for `eventId` with the user's
 * confirmed extraction content (labels + timetable entries).
 *
 * Called after `createEvent()` has inserted the event and its blank days.
 * Mirrors the insert-with-rollback pattern used by `createEventFromTemplate()`
 * so a partial failure never leaves a half-populated event.
 *
 * Rollback: on any failure we delete the entire event — cascade removes any
 * days and entries that were inserted. The caller has already written the
 * event row via createEvent, so this is a full undo.
 */
export async function saveExtractedEventContent(
  eventId: string,
  days: ExtractedDay[],
  meta: ExtractionMeta
): Promise<ActionResult> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) {
    return { success: false, error: 'You do not have permission to save this event.' }
  }

  // Guard against a preview that was edited to exceed MAX_EVENT_DAYS.
  if (days.length > MAX_EVENT_DAYS) {
    return {
      success: false,
      error: `Events are limited to ${MAX_EVENT_DAYS} days. This extraction contains ${days.length} days — please remove some before confirming.`,
    }
  }

  // Ownership check — the event must belong to the caller's org.
  const { data: eventRow, error: fetchErr } = await supabase
    .from('events')
    .select('id, org_id, title, start_date, end_date')
    .eq('id', eventId)
    .single()

  if (fetchErr || !eventRow) {
    Sentry.captureException(fetchErr ?? new Error('saveExtractedEventContent: event not found'), {
      tags: { action: 'saveExtractedEventContent.fetchEvent' },
      extra: { eventId },
    })
    return { success: false, error: 'Could not save the extracted content. Please retry.' }
  }

  if (eventRow.org_id !== membership.org_id) {
    return { success: false, error: 'You do not have permission to save this event.' }
  }

  const rollback = async () => {
    await supabase.from('events').delete().eq('id', eventId)
  }

  // Wipe the blank days auto-created by createEvent so we can replace them
  // with labelled days + entries. Cascade removes any entries too (there are
  // none at this point — createEvent doesn't insert entries).
  const { error: wipeErr } = await supabase
    .from('event_days')
    .delete()
    .eq('event_id', eventId)

  if (wipeErr) {
    Sentry.captureException(wipeErr, {
      tags: { action: 'saveExtractedEventContent.wipeDays' },
      extra: { eventId },
    })
    await rollback()
    return { success: false, error: 'Could not save the extracted content. Please retry.' }
  }

  // Map extracted days onto real dates within the event's range. If the
  // extraction includes explicit dates we trust them; otherwise we walk the
  // event's range by index. countDaysInRange is inclusive.
  const rangeLength = countDaysInRange(eventRow.start_date, eventRow.end_date)
  const toIso = (d: string, i: number): string => {
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d
    const base = new Date(eventRow.start_date + 'T00:00:00Z')
    base.setUTCDate(base.getUTCDate() + i)
    return base.toISOString().split('T')[0]
  }

  let failureReason: 'day' | 'entry' | null = null

  for (let i = 0; i < days.length; i++) {
    if (i >= rangeLength) break // defensive; enforced above via MAX_EVENT_DAYS
    const extractedDay = days[i]
    const date = toIso(extractedDay.date ?? '', i)

    const { data: newDay, error: dayErr } = await supabase
      .from('event_days')
      .insert({
        event_id: eventId,
        date,
        label: extractedDay.label,
        sort_order: i,
      })
      .select('id')
      .single()

    if (dayErr || !newDay) {
      Sentry.captureException(
        dayErr ?? new Error('saveExtractedEventContent: day insert returned no row'),
        { tags: { action: 'saveExtractedEventContent.insertDay' }, extra: { eventId, dayIndex: i } }
      )
      failureReason = 'day'
      break
    }

    if (extractedDay.entries.length > 0) {
      const { error: entriesErr } = await supabase.from('timetable_entries').insert(
        extractedDay.entries.map((e, idx) => ({
          event_day_id: newDay.id,
          title: e.title,
          start_time: e.start_time,
          end_time: e.end_time,
          category: e.category,
          notes: e.notes,
          sort_order: idx,
          is_break: e.is_break,
        }))
      )
      if (entriesErr) {
        Sentry.captureException(entriesErr, {
          tags: { action: 'saveExtractedEventContent.insertEntries' },
          extra: { eventId, dayIndex: i },
        })
        failureReason = 'entry'
        break
      }
    }
  }

  if (failureReason) {
    await rollback()
    return { success: false, error: 'Could not save the extracted content. Please retry.' }
  }

  const detail: Record<string, unknown> = {
    source_mime: meta.source_mime,
    source_bytes: meta.source_bytes,
    day_count: days.length,
  }
  if (meta.mock) detail.mock = true
  if (meta.model) detail.model = meta.model
  if (typeof meta.tokens_input === 'number') detail.tokens_input = meta.tokens_input
  if (typeof meta.tokens_output === 'number') detail.tokens_output = meta.tokens_output
  if (meta.extraction_id) detail.extraction_id = meta.extraction_id

  await writeAuditLog(
    supabase,
    user.id,
    { eventId },
    'event.created_from_extraction',
    detail,
    makeActorContext(membership),
  )

  // Link the ai_extraction_log row to the newly-created event so we can
  // trace from event → original upload for the whole 30-day archive window.
  if (meta.extraction_id) {
    const admin = createAdminClient()
    const { error: linkErr } = await admin
      .from('ai_extraction_log')
      .update({ event_id: eventId })
      .eq('id', meta.extraction_id)
    if (linkErr) {
      Sentry.captureException(linkErr, {
        tags: { action: 'saveExtractedEventContent.linkExtraction' },
        extra: { eventId, extractionId: meta.extraction_id },
      })
      // Not user-visible — the event saved fine, only the cross-link failed.
    }
  }

  revalidatePath('/admin/events')
  revalidatePath(`/admin/events/${eventId}`)

  return { success: true, data: undefined }
}
