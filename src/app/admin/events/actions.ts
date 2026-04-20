'use server'

import { createClient } from '@/lib/supabase/server'
import { slugify, getDatesInRange, countDaysInRange, MAX_EVENT_DAYS } from '@/lib/utils/slug'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { EventStatus, Json } from '@/lib/types/database'
import { sendEventNotification } from '@/lib/resend/notifications'
import { debugLog } from '@/lib/debug'
import { getActiveOrg } from '@/lib/utils/active-org'
import { writeAuditLog, makeActorContext, type AuditLogEntry } from '@/lib/audit'
import { loadAuditLog } from '@/app/admin/audit/actions'
import * as Sentry from '@sentry/nextjs'

export type { AuditLogEntry } from '@/lib/audit'

// ---------------------------------------------------------------------------
// Revalidation helpers
// ---------------------------------------------------------------------------

/**
 * Revalidates admin-side caches for an event: the event list and, when an
 * eventId is supplied, the specific event editor page. Kept small so
 * callers can choose how broadly to invalidate.
 */
function revalidateAdminEventPaths(eventId?: string): void {
  revalidatePath('/admin/events')
  if (eventId) revalidatePath(`/admin/events/${eventId}`)
}

/**
 * Revalidates consumer/public caches affected by published-event changes:
 * the dynamic public timetable route, the `/my` consumer dashboard, the
 * landing page (lists published events), and the sitemap.
 */
function revalidatePublicEventPaths(): void {
  // MGT-082: canonical public event URL is now nested under the owning
  // organisation (`/[orgSlug]/[eventSlug]`). The top-level `/[slug]` route
  // still resolves organisations and issues 308 redirects for legacy event
  // slugs, so it is invalidated alongside the new nested path.
  revalidatePath('/[orgSlug]/[eventSlug]', 'page')
  revalidatePath('/[orgSlug]/[eventSlug]/print', 'page')
  revalidatePath('/[slug]', 'page')
  revalidatePath('/my')
  revalidatePath('/')
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function requireUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return { supabase, user }
}

/**
 * Requires the calling user to be authenticated AND to hold an allowed role
 * (owner | admin | editor) in their active org.
 *
 * Returns { supabase, user, membership } where membership is the user's
 * active org (resolved via cookie with fallback), or membership: null if
 * the user has no qualifying role.  Every mutation action must check
 * membership !== null before proceeding.
 */
async function requireEditor() {
  const { supabase, user } = await requireUser()
  const membership = await getActiveOrg(supabase, user.id)
  return { supabase, user, membership }
}

/**
 * MGT-082: compute an event slug within an organisation and verify it is
 * free. No auto-suffixing — callers surface the friendly error so users can
 * pick a different title. The DB enforces uniqueness via
 * `events_org_id_slug_key`; this pre-check exists only to replace the
 * generic Postgres error with a human-readable message.
 */
async function computeEventSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  title: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const slug = slugify(title) || `event-${Date.now()}`
  const { data, error } = await supabase
    .from('events')
    .select('id')
    .eq('org_id', orgId)
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    Sentry.captureException(
      new Error(`computeEventSlug.select failed: ${error.message}`),
      { tags: { action: 'computeEventSlug' } },
    )
    return { ok: false, error: 'Could not verify the event name. Please retry.' }
  }
  if (data) {
    return {
      ok: false,
      error:
        'An event with this title already exists in this organisation. Please choose a different title.',
    }
  }
  return { ok: true, slug }
}


// ---------------------------------------------------------------------------
// Event CRUD
// ---------------------------------------------------------------------------

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export interface CreateEventInput {
  title: string
  venue: string
  start_date: string
  end_date: string
  timezone: string
  notes: string
}

export async function createEvent(input: CreateEventInput): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) {
    return { success: false, error: 'You do not have permission to create events.' }
  }

  // Enforce the event day-span limit up front so we never silently drop days.
  // `getDatesInRange` no longer caps at 14 — the caller is responsible for
  // rejecting oversized ranges with a clear error.
  const requestedDays = countDaysInRange(input.start_date, input.end_date)
  if (requestedDays === 0) {
    return { success: false, error: 'End date must be on or after the start date.' }
  }
  if (requestedDays > MAX_EVENT_DAYS) {
    return {
      success: false,
      error: `Events are limited to ${MAX_EVENT_DAYS} days. The selected range spans ${requestedDays} days — please shorten it.`,
    }
  }

  const slugResult = await computeEventSlug(supabase, membership.org_id, input.title)
  if (!slugResult.ok) {
    return { success: false, error: slugResult.error }
  }
  const slug = slugResult.slug

  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      org_id: membership.org_id,
      title: input.title.trim(),
      slug,
      venue: input.venue.trim() || null,
      start_date: input.start_date,
      end_date: input.end_date,
      timezone: input.timezone || 'Europe/London',
      notes: input.notes.trim() || null,
      status: 'draft',
    })
    .select('id')
    .single()

  const genericCreateError = 'Could not create this event. Please retry.'
  if (eventError) {
    Sentry.captureException(
      new Error(`createEvent.insertEvent failed: ${eventError.message}`),
      { tags: { action: 'createEvent.insertEvent' } }
    )
    return { success: false, error: genericCreateError }
  }
  if (!event) {
    Sentry.captureException(
      new Error('createEvent.insertEvent returned no row'),
      { tags: { action: 'createEvent.insertEventNoData' } }
    )
    return { success: false, error: genericCreateError }
  }

  // Auto-create event days for the date range
  const dates = getDatesInRange(input.start_date, input.end_date)
  if (dates.length > 0) {
    const { error: daysError } = await supabase.from('event_days').insert(
      dates.map((date, i) => ({
        event_id: event.id,
        date,
        sort_order: i,
      }))
    )
    if (daysError) {
      // Clean up the event if day creation fails
      await supabase.from('events').delete().eq('id', event.id)
      Sentry.captureException(
        new Error(`createEvent.insertDays failed: ${daysError.message}`),
        { tags: { action: 'createEvent.insertDays' } }
      )
      return { success: false, error: genericCreateError }
    }
  }

  await writeAuditLog(supabase, user.id, { eventId: event.id }, 'event.created', {
    title: input.title,
    slug,
  }, makeActorContext(membership))

  revalidateAdminEventPaths()

  return { success: true, data: { id: event.id } }
}

// ---------------------------------------------------------------------------

export interface UpdateEventMetadataInput {
  title: string
  venue: string
  start_date: string
  end_date: string
  timezone: string
  notes: string
  /** Comma-separated email addresses; parsed and validated server-side. */
  notification_emails: string
}

/**
 * Parses a comma-separated email string into a normalised, deduplicated
 * array of valid addresses.  Invalid entries are silently dropped.
 */
function parseEmails(raw: string): string[] {
  const seen = new Set<string>()
  return raw
    .split(/[,\n]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => {
      if (!e || seen.has(e)) return false
      // Basic structural validation — not exhaustive, but catches typos
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false
      seen.add(e)
      return true
    })
}

export async function updateEventMetadata(
  eventId: string,
  input: UpdateEventMetadataInput
): Promise<ActionResult> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'You do not have permission to perform this action.' }

  const parsedEmails = parseEmails(input.notification_emails)

  // Fetch current values so we can diff what actually changed
  const { data: current } = await supabase
    .from('events')
    .select('title, venue, start_date, end_date, timezone, notes')
    .eq('id', eventId)
    .single()

  const { error } = await supabase
    .from('events')
    .update({
      title: input.title.trim(),
      venue: input.venue.trim() || null,
      start_date: input.start_date,
      end_date: input.end_date,
      timezone: input.timezone || 'Europe/London',
      notes: input.notes.trim() || null,
      notification_emails: parsedEmails,
    })
    .eq('id', eventId)

  if (error) {
    Sentry.captureException(
      new Error(`updateEventMetadata.update failed: ${error.message}`),
      { tags: { action: 'updateEventMetadata.update' } }
    )
    return { success: false, error: 'Could not save this event. Please retry.' }
  }

  // Build a diff of changed fields only
  if (current) {
    const next = {
      title:      input.title.trim(),
      venue:      input.venue.trim() || null,
      start_date: input.start_date,
      end_date:   input.end_date,
      timezone:   input.timezone || 'Europe/London',
      notes:      input.notes.trim() || null,
    }
    const changes: Record<string, { from: string | null; to: string | null }> = {}
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      const oldVal = current[key] ?? null
      const newVal = next[key] ?? null
      if (oldVal !== newVal) {
        changes[key] = { from: oldVal, to: newVal }
      }
    }
    await writeAuditLog(
      supabase,
      user.id,
      { eventId },
      'event.updated',
      Object.keys(changes).length > 0 ? { changes } : undefined,
      makeActorContext(membership),
    )
  } else {
    await writeAuditLog(
      supabase,
      user.id,
      { eventId },
      'event.updated',
      undefined,
      makeActorContext(membership),
    )
  }

  revalidateAdminEventPaths(eventId)
  // Public timetable page reads event metadata (title, venue, dates) so it
  // must also be invalidated.
  revalidatePublicEventPaths()

  return { success: true, data: undefined }
}

// ---------------------------------------------------------------------------

export async function publishEvent(eventId: string, notify: boolean = false): Promise<ActionResult> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'You do not have permission to perform this action.' }

  const { error } = await supabase
    .from('events')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', eventId)

  if (error) {
    Sentry.captureException(
      new Error(`publishEvent.update failed: ${error.message}`),
      { tags: { action: 'publishEvent.update' } }
    )
    return { success: false, error: 'Could not publish this event. Please retry.' }
  }

  // ── Create timetable snapshot ─────────────────────────────────
  try {
    const { data: days } = await supabase
      .from('event_days')
      .select('id, date, label, sort_order')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })

    const dayList = days ?? []
    const dayIds = dayList.map((d) => d.id)

    let allEntries: Array<{
      event_day_id: string
      title: string
      start_time: string
      end_time: string | null
      category: string | null
      notes: string | null
      sort_order: number
      is_break: boolean
    }> = []
    if (dayIds.length > 0) {
      const { data: entries } = await supabase
        .from('timetable_entries')
        .select('event_day_id, title, start_time, end_time, category, notes, sort_order, is_break')
        .in('event_day_id', dayIds)
        .order('sort_order', { ascending: true })
      allEntries = entries ?? []
    }

    // Build snapshot data: days with their entries nested
    const snapshotData = dayList.map((day) => ({
      date: day.date,
      label: day.label,
      sort_order: day.sort_order,
      entries: allEntries
        .filter((e) => e.event_day_id === day.id)
        .map(({ event_day_id: _, ...rest }) => rest),
    }))

    // Determine next version
    const { data: maxRow } = await supabase
      .from('timetable_snapshots')
      .select('version')
      .eq('event_id', eventId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (maxRow?.version ?? 0) + 1

    await supabase.from('timetable_snapshots').insert({
      event_id: eventId,
      version: nextVersion,
      data: snapshotData as unknown as import('@/lib/types/database').Json,
      published_by: user.id,
    })

    await writeAuditLog(
      supabase,
      user.id,
      { eventId },
      'event.published',
      { version: nextVersion },
      makeActorContext(membership),
    )
  } catch (err) {
    // Snapshot failure should not block the publish
    Sentry.captureException(err, { tags: { action: 'publishEvent.snapshot' } })
    await writeAuditLog(
      supabase,
      user.id,
      { eventId },
      'event.published',
      undefined,
      makeActorContext(membership),
    )
  }

  // Send publish notification only when the caller explicitly opted in
  if (notify) {
    await sendEventNotification(supabase, eventId, 'event.published')
  }

  revalidateAdminEventPaths(eventId)
  revalidatePublicEventPaths()

  return { success: true, data: undefined }
}

export async function unpublishEvent(eventId: string): Promise<ActionResult> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'You do not have permission to perform this action.' }

  const { error } = await supabase
    .from('events')
    .update({ status: 'draft' })
    .eq('id', eventId)

  if (error) {
    Sentry.captureException(
      new Error(`unpublishEvent.update failed: ${error.message}`),
      { tags: { action: 'unpublishEvent.update' } }
    )
    return { success: false, error: 'Could not unpublish this event. Please retry.' }
  }

  await writeAuditLog(
    supabase,
    user.id,
    { eventId },
    'event.unpublished',
    undefined,
    makeActorContext(membership),
  )

  revalidateAdminEventPaths(eventId)
  revalidatePublicEventPaths()

  return { success: true, data: undefined }
}

export async function archiveEvent(eventId: string): Promise<ActionResult> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'You do not have permission to perform this action.' }

  const { error } = await supabase
    .from('events')
    .update({ status: 'archived' })
    .eq('id', eventId)

  if (error) {
    Sentry.captureException(
      new Error(`archiveEvent.update failed: ${error.message}`),
      { tags: { action: 'archiveEvent.update' } }
    )
    return { success: false, error: 'Could not archive this event. Please retry.' }
  }

  await writeAuditLog(
    supabase,
    user.id,
    { eventId },
    'event.archived',
    undefined,
    makeActorContext(membership),
  )

  revalidateAdminEventPaths(eventId)
  revalidatePublicEventPaths()

  return { success: true, data: undefined }
}

// ---------------------------------------------------------------------------

export interface DuplicateEventInput {
  title: string
  start_date: string
  end_date: string
}

export async function duplicateEvent(
  sourceEventId: string,
  input: DuplicateEventInput
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'You do not have permission to duplicate events.' }

  // Guard the new date range up front. Duplicate reuses the source's day
  // offsets, but the new event still advertises the user-supplied date range
  // on the record — reject ranges longer than the supported limit instead
  // of silently creating an event whose day count doesn't match its dates.
  const requestedDays = countDaysInRange(input.start_date, input.end_date)
  if (requestedDays === 0) {
    return { success: false, error: 'End date must be on or after the start date.' }
  }
  if (requestedDays > MAX_EVENT_DAYS) {
    return {
      success: false,
      error: `Events are limited to ${MAX_EVENT_DAYS} days. The selected range spans ${requestedDays} days — please shorten it.`,
    }
  }

  // Fetch source event
  const { data: source, error: srcErr } = await supabase
    .from('events')
    .select('*')
    .eq('id', sourceEventId)
    .single()

  if (srcErr || !source) return { success: false, error: 'Source event not found' }

  const slugResult = await computeEventSlug(supabase, source.org_id, input.title)
  if (!slugResult.ok) {
    return { success: false, error: slugResult.error }
  }
  const slug = slugResult.slug

  // Create new event (always draft)
  const { data: newEvent, error: newErr } = await supabase
    .from('events')
    .insert({
      org_id: source.org_id,
      title: input.title.trim(),
      slug,
      venue: source.venue,
      timezone: source.timezone,
      notes: source.notes,
      status: 'draft' as EventStatus,
      start_date: input.start_date,
      end_date: input.end_date,
      branding: source.branding,
    })
    .select('id')
    .single()

  const genericDuplicateError = 'Could not duplicate this event. Please retry.'
  if (newErr) {
    Sentry.captureException(
      new Error(`duplicateEvent.insertEvent failed: ${newErr.message}`),
      { tags: { action: 'duplicateEvent.insertEvent' }, extra: { sourceEventId } }
    )
    return { success: false, error: genericDuplicateError }
  }
  if (!newEvent) {
    Sentry.captureException(
      new Error('duplicateEvent.insertEvent returned no row'),
      { tags: { action: 'duplicateEvent.insertEventNoData' }, extra: { sourceEventId } }
    )
    return { success: false, error: genericDuplicateError }
  }

  // Fetch source days
  const { data: sourceDays } = await supabase
    .from('event_days')
    .select('*, timetable_entries(*)')
    .eq('event_id', sourceEventId)
    .order('sort_order', { ascending: true })

  if (sourceDays && sourceDays.length > 0) {
    // Generate new dates for duplicated days using same day offsets
    const sourceStart = new Date(source.start_date + 'T00:00:00Z')
    const newStart = new Date(input.start_date + 'T00:00:00Z')
    const offsetMs = newStart.getTime() - sourceStart.getTime()

    let failureReason: string | null = null

    for (const sourceDay of sourceDays) {
      const originalDate = new Date(sourceDay.date + 'T00:00:00Z')
      const newDate = new Date(originalDate.getTime() + offsetMs)
      const newDateStr = newDate.toISOString().split('T')[0]

      const { data: newDay, error: dayErr } = await supabase
        .from('event_days')
        .insert({
          event_id: newEvent.id,
          date: newDateStr,
          label: sourceDay.label,
          sort_order: sourceDay.sort_order,
        })
        .select('id')
        .single()

      if (dayErr || !newDay) {
        Sentry.captureException(
          new Error(`duplicateEvent.insertDay failed: ${dayErr?.message ?? 'no row'}`),
          { tags: { action: 'duplicateEvent.insertDay' }, extra: { sourceEventId } }
        )
        failureReason = 'day'
        break
      }

      // Deep copy entries for this day
      const entries = (sourceDay as typeof sourceDay & { timetable_entries: unknown[] }).timetable_entries
      if (entries && entries.length > 0) {
        type EntryRow = {
          title: string
          start_time: string
          end_time: string | null
          category: string | null
          notes: string | null
          sort_order: number
          is_break: boolean
        }
        const { error: entriesErr } = await supabase.from('timetable_entries').insert(
          (entries as EntryRow[]).map((e) => ({
            event_day_id: newDay.id,
            title: e.title,
            start_time: e.start_time,
            end_time: e.end_time,
            category: e.category,
            notes: e.notes,
            sort_order: e.sort_order,
            is_break: e.is_break,
          }))
        )
        if (entriesErr) {
          Sentry.captureException(
            new Error(`duplicateEvent.insertEntries failed: ${entriesErr.message}`),
            { tags: { action: 'duplicateEvent.insertEntries' }, extra: { sourceEventId } }
          )
          failureReason = 'entry'
          break
        }
      }
    }

    if (failureReason) {
      // Roll back the partially-created duplicate so the user doesn't end
      // up with a silently-incomplete event. Cascade deletes remove any
      // already-inserted days and entries. The underlying Supabase error
      // was already captured to Sentry above with a sub-tag
      // (`duplicateEvent.insertDay` or `duplicateEvent.insertEntries`).
      await supabase.from('events').delete().eq('id', newEvent.id)
      return { success: false, error: genericDuplicateError }
    }
  }

  await writeAuditLog(
    supabase,
    user.id,
    { eventId: newEvent.id },
    'event.duplicated',
    {
      source_event_id: sourceEventId,
      title: input.title,
    },
    makeActorContext(membership),
  )

  revalidateAdminEventPaths()

  return { success: true, data: { id: newEvent.id } }
}

// ---------------------------------------------------------------------------
// Event Days
// ---------------------------------------------------------------------------

export async function addEventDay(
  eventId: string,
  date: string,
  label?: string
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'You do not have permission to perform this action.' }

  // Get current max sort_order for this event
  const { data: existing } = await supabase
    .from('event_days')
    .select('sort_order')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

  const trimmedLabel = label?.trim() || null

  const { data, error } = await supabase
    .from('event_days')
    .insert({
      event_id: eventId,
      date,
      label: trimmedLabel,
      sort_order: nextOrder,
    })
    .select('id')
    .single()

  const genericAddError = 'Could not add this day. Please retry.'
  if (error) {
    Sentry.captureException(
      new Error(`addEventDay.insert failed: ${error.message}`),
      { tags: { action: 'addEventDay.insert' } }
    )
    return { success: false, error: genericAddError }
  }
  if (!data) {
    Sentry.captureException(
      new Error('addEventDay.insert returned no row'),
      { tags: { action: 'addEventDay.insertNoData' } }
    )
    return { success: false, error: genericAddError }
  }

  await writeAuditLog(
    supabase,
    user.id,
    { eventId },
    'event_day.added',
    { day_id: data.id, date, label: trimmedLabel },
    makeActorContext(membership),
  )

  revalidateAdminEventPaths(eventId)
  revalidatePublicEventPaths()

  return { success: true, data: { id: data.id } }
}

export async function removeEventDay(dayId: string): Promise<ActionResult> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'You do not have permission to perform this action.' }

  const genericError = 'Could not remove this day. Please retry.'

  // Resolve the parent event_id (plus date/label for the audit detail)
  // BEFORE the delete, so the audit row can be written against a valid
  // event scope and under the existing audit_log RLS policy.
  const { data: dayRow, error: lookupError } = await supabase
    .from('event_days')
    .select('event_id, date, label')
    .eq('id', dayId)
    .single()

  if (lookupError || !dayRow) {
    Sentry.captureException(
      new Error(`removeEventDay.lookup failed: ${lookupError?.message ?? 'no row'}`),
      { tags: { action: 'removeEventDay.lookup' } }
    )
    return { success: false, error: genericError }
  }

  // Cascade: delete entries first (RLS may require explicit delete).
  // If this fails we must NOT proceed to the day delete — otherwise we
  // either leak a raw FK-violation error to the UI or orphan rows via
  // cascade. Capture the failure to Sentry and return a clean message.
  const { error: entriesError } = await supabase
    .from('timetable_entries')
    .delete()
    .eq('event_day_id', dayId)

  if (entriesError) {
    Sentry.captureException(
      new Error(`removeEventDay.deleteEntries failed: ${entriesError.message}`),
      { tags: { action: 'removeEventDay.deleteEntries' } }
    )
    return { success: false, error: genericError }
  }

  const { error } = await supabase.from('event_days').delete().eq('id', dayId)
  if (error) {
    Sentry.captureException(
      new Error(`removeEventDay.deleteDay failed: ${error.message}`),
      { tags: { action: 'removeEventDay.deleteDay' } }
    )
    return { success: false, error: genericError }
  }

  await writeAuditLog(
    supabase,
    user.id,
    { eventId: dayRow.event_id },
    'event_day.removed',
    { day_id: dayId, date: dayRow.date, label: dayRow.label },
    makeActorContext(membership),
  )

  // dayId alone does not identify the parent event, so revalidate the
  // admin event editor dynamic route and the public timetable route.
  revalidatePath('/admin/events/[id]', 'page')
  revalidatePath('/[slug]', 'page')

  return { success: true, data: undefined }
}

export async function updateDayLabel(dayId: string, label: string): Promise<ActionResult> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'You do not have permission to perform this action.' }

  // Pre-fetch event_id + current label so we can (a) audit against a
  // valid event scope and (b) suppress the audit row on a no-op save
  // (label unchanged) to match saveDayEntries' hasSubstantiveChanges gate.
  const { data: dayRow, error: lookupError } = await supabase
    .from('event_days')
    .select('event_id, label')
    .eq('id', dayId)
    .single()

  if (lookupError || !dayRow) {
    Sentry.captureException(
      new Error(`updateDayLabel.lookup failed: ${lookupError?.message ?? 'no row'}`),
      { tags: { action: 'updateDayLabel.lookup' } }
    )
    return { success: false, error: 'Could not save this day label. Please retry.' }
  }

  const nextLabel = label.trim() || null
  const prevLabel = dayRow.label ?? null

  const { error } = await supabase
    .from('event_days')
    .update({ label: nextLabel })
    .eq('id', dayId)

  if (error) {
    Sentry.captureException(
      new Error(`updateDayLabel.update failed: ${error.message}`),
      { tags: { action: 'updateDayLabel.update' } }
    )
    return { success: false, error: 'Could not save this day label. Please retry.' }
  }

  if (prevLabel !== nextLabel) {
    await writeAuditLog(
      supabase,
      user.id,
      { eventId: dayRow.event_id },
      'event_day.label_updated',
      { day_id: dayId, changes: { label: { from: prevLabel, to: nextLabel } } },
      makeActorContext(membership),
    )
  }

  revalidatePath('/admin/events/[id]', 'page')
  revalidatePath('/[slug]', 'page')

  return { success: true, data: undefined }
}

// ---------------------------------------------------------------------------
// Timetable Entries
// ---------------------------------------------------------------------------

export interface EntryInput {
  id: string | null
  event_day_id: string
  title: string
  start_time: string
  end_time: string | null
  category: string | null
  notes: string | null
  sort_order: number
  is_break: boolean
}

/**
 * Saves a complete set of entries across all days for an event.
 * - Snapshots current DB state first, so we can diff afterwards.
 * - Upserts entries that have an id (existing) or inserts new ones.
 * - Deletes entries by id that are in deletedIds.
 * - Writes a detailed audit log entry describing exactly what changed.
 */
export async function saveDayEntries(
  eventId: string,
  entries: EntryInput[],
  deletedIds: string[],
  notify: boolean = false
): Promise<ActionResult<{ savedIds: (string | null)[] }>> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'You do not have permission to perform this action.' }

  // ── 1. Snapshot current state BEFORE any mutations ───────────────────────
  const affectedDayIds = Array.from(new Set(entries.map((e) => e.event_day_id)))

  let currentRows: import('@/lib/types/database').TimetableEntry[] = []
  if (affectedDayIds.length > 0) {
    const { data } = await supabase
      .from('timetable_entries')
      .select('*')
      .in('event_day_id', affectedDayIds)
    currentRows = data ?? []
  }

  // Some deleted entries may live in days not in the submission (edge case)
  const foundIds = new Set(currentRows.map((r) => r.id))
  const orphanDeleteIds = deletedIds.filter((id) => !foundIds.has(id))
  if (orphanDeleteIds.length > 0) {
    const { data } = await supabase
      .from('timetable_entries')
      .select('*')
      .in('id', orphanDeleteIds)
    currentRows = [...currentRows, ...(data ?? [])]
  }

  const currentMap = Object.fromEntries(currentRows.map((r) => [r.id, r]))

  // ── 2. Apply mutations ────────────────────────────────────────────────────
  if (deletedIds.length > 0) {
    const { error: delError } = await supabase
      .from('timetable_entries')
      .delete()
      .in('id', deletedIds)
    if (delError) {
      Sentry.captureException(
        new Error(`saveDayEntries.delete failed: ${delError.message}`),
        { tags: { action: 'saveDayEntries.delete' }, extra: { eventId } }
      )
      return { success: false, error: 'Could not save entries. Please retry.' }
    }
  }

  if (entries.length === 0) return { success: true, data: { savedIds: [] } }

  const toInsert = entries.filter((e) => !e.id)
  const toUpdate = entries.filter((e) => !!e.id)
  const savedIds: (string | null)[] = new Array(entries.length).fill(null)

  if (toUpdate.length > 0) {
    const { error: updErr } = await supabase.from('timetable_entries').upsert(
      toUpdate.map((e) => ({
        id: e.id as string,
        event_day_id: e.event_day_id,
        title: e.title,
        start_time: e.start_time,
        end_time: e.end_time,
        category: e.category,
        notes: e.notes,
        sort_order: e.sort_order,
        is_break: e.is_break,
      }))
    )
    if (updErr) {
      Sentry.captureException(
        new Error(`saveDayEntries.update failed: ${updErr.message}`),
        { tags: { action: 'saveDayEntries.update' }, extra: { eventId } }
      )
      return { success: false, error: 'Could not save entries. Please retry.' }
    }
    toUpdate.forEach((e) => {
      savedIds[entries.indexOf(e)] = e.id
    })
  }

  const insertFailures: Array<{ title: string; error: string }> = []

  for (const e of toInsert) {
    const { data, error: insErr } = await supabase
      .from('timetable_entries')
      .insert({
        event_day_id: e.event_day_id,
        title: e.title,
        start_time: e.start_time,
        end_time: e.end_time,
        category: e.category,
        notes: e.notes,
        sort_order: e.sort_order,
        is_break: e.is_break,
      })
      .select('id')
      .single()

    if (insErr || !data) {
      insertFailures.push({ title: e.title, error: insErr?.message ?? 'unknown error' })
      continue
    }
    savedIds[entries.indexOf(e)] = data.id
  }

  // If any new-entry inserts failed, stop here. Do NOT run audit logging
  // or notifications — the caller must see this as a failure so they can
  // retry. DB state may be partially mutated (deletes and updates already
  // applied), which is unavoidable without a transaction, but reporting
  // success would be worse.
  if (insertFailures.length > 0) {
    Sentry.captureException(
      new Error(`saveDayEntries: ${insertFailures.length} insert failure(s)`),
      { tags: { action: 'saveDayEntries' }, extra: { eventId, insertFailures } }
    )
    return {
      success: false,
      error: `Failed to save ${insertFailures.length} new entr${insertFailures.length === 1 ? 'y' : 'ies'}. Please retry — some changes may not have been persisted.`,
    }
  }

  // ── 3. Compute diff and write audit log ───────────────────────────────────
  // Normalize helpers: DB returns time as "HH:MM:SS"; form submits "HH:MM"
  const nTime = (t: string | null | undefined): string | null =>
    t ? t.slice(0, 5) : null
  const nStr = (s: string | null | undefined): string | null =>
    !s || s.trim() === '' ? null : s.trim()

  // Added — new entries (no prior id)
  const added = entries
    .filter((e) => !e.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((e) => ({
      title: e.title,
      start_time: nTime(e.start_time) ?? '',
      end_time: nTime(e.end_time),
      category: nStr(e.category),
      is_break: e.is_break,
    }))

  // Removed — entries that were deleted
  const removed = deletedIds
    .map((id) => currentMap[id])
    .filter(Boolean)
    .map((r) => ({
      title: r.title,
      start_time: nTime(r.start_time) ?? '',
      end_time: nTime(r.end_time),
      category: nStr(r.category),
    }))

  // Changed / Reordered — existing entries with modifications
  const changed: Array<{
    title: string
    changes: Record<string, { from: unknown; to: unknown }>
  }> = []
  const reordered: string[] = []  // titles in new sort order, sort_order-only changes

  for (const entry of [...entries.filter((e) => e.id)].sort(
    (a, b) => a.sort_order - b.sort_order
  )) {
    const cur = currentMap[entry.id as string]
    if (!cur) continue

    const diff: Record<string, { from: unknown; to: unknown }> = {}

    if ((cur.title ?? null) !== (entry.title ?? null))
      diff.title = { from: cur.title ?? null, to: entry.title ?? null }

    const [oldStart, newStart] = [nTime(cur.start_time), nTime(entry.start_time)]
    if (oldStart !== newStart) diff.start_time = { from: oldStart, to: newStart }

    const [oldEnd, newEnd] = [nTime(cur.end_time), nTime(entry.end_time)]
    if (oldEnd !== newEnd) diff.end_time = { from: oldEnd, to: newEnd }

    const [oldCat, newCat] = [nStr(cur.category), nStr(entry.category)]
    if (oldCat !== newCat) diff.category = { from: oldCat, to: newCat }

    const [oldNotes, newNotes] = [nStr(cur.notes), nStr(entry.notes)]
    if (oldNotes !== newNotes) diff.notes = { from: oldNotes, to: newNotes }

    if (cur.is_break !== entry.is_break)
      diff.is_break = { from: cur.is_break, to: entry.is_break }

    if (cur.sort_order !== entry.sort_order)
      diff.sort_order = { from: cur.sort_order, to: entry.sort_order }

    const keys = Object.keys(diff)
    if (keys.length === 0) continue

    if (keys.length === 1 && keys[0] === 'sort_order') {
      // Only position changed — part of a drag-reorder operation
      reordered.push(entry.title)
    } else {
      // Substantive field change (sort_order included in diff if it also moved)
      changed.push({ title: entry.title, changes: diff })
    }
  }

  const detail: Record<string, unknown> = {}
  if (added.length > 0)    detail.added    = added
  if (removed.length > 0)  detail.removed  = removed
  if (changed.length > 0)  detail.changed  = changed
  if (reordered.length > 0) detail.reordered = reordered

  const hasSubstantiveChanges = Object.keys(detail).length > 0

  if (hasSubstantiveChanges) {
    await writeAuditLog(
      supabase,
      user.id,
      { eventId },
      'timetable.updated',
      detail,
      makeActorContext(membership),
    )
  }

  debugLog('saveDayEntries', 'hasSubstantiveChanges:', hasSubstantiveChanges, '| notify:', notify)
  // Send timetable update notification only when:
  //   1. The caller explicitly requested notification
  //   2. There were substantive changes (not a no-op save)
  //   3. The event is currently published (draft saves are silent)
  if (hasSubstantiveChanges && notify) {
    const { data: eventRow } = await supabase
      .from('events')
      .select('status')
      .eq('id', eventId)
      .maybeSingle()

    debugLog('saveDayEntries', 'event status:', eventRow?.status)
    if (eventRow?.status === 'published') {
      debugLog('saveDayEntries', 'CALLING sendEventNotification')
      // Fire-and-forget — failures are logged, not thrown
      await sendEventNotification(supabase, eventId, 'timetable.updated')
    }
  }

  revalidateAdminEventPaths(eventId)
  revalidatePublicEventPaths()

  return { success: true, data: { savedIds } }
}

// ---------------------------------------------------------------------------
// Version History
// ---------------------------------------------------------------------------

export interface VersionSummary {
  id: string
  version: number
  published_at: string
  published_by_email: string | null
}

export async function getVersionHistory(
  eventId: string
): Promise<ActionResult<VersionSummary[]>> {
  const { supabase, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'No permission.' }

  const { data, error } = await supabase
    .from('timetable_snapshots')
    .select('id, version, published_at, published_by')
    .eq('event_id', eventId)
    .order('version', { ascending: false })

  if (error) {
    Sentry.captureException(error, { tags: { action: 'getVersionHistory.select' } })
    return { success: false, error: 'Could not load version history. Please retry.' }
  }

  // Resolve publisher emails
  const publisherIds = Array.from(new Set((data ?? []).map((r) => r.published_by).filter(Boolean))) as string[]
  let emailMap: Record<string, string> = {}
  if (publisherIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .in('id', publisherIds)
    emailMap = Object.fromEntries((users ?? []).map((u) => [u.id, u.email]))
  }

  const versions: VersionSummary[] = (data ?? []).map((row) => ({
    id: row.id,
    version: row.version,
    published_at: row.published_at,
    published_by_email: row.published_by ? emailMap[row.published_by] ?? null : null,
  }))

  return { success: true, data: versions }
}

export interface SnapshotDay {
  date: string
  label: string | null
  sort_order: number
  entries: Array<{
    title: string
    start_time: string
    end_time: string | null
    category: string | null
    notes: string | null
    sort_order: number
    is_break: boolean
  }>
}

export interface SnapshotDetail {
  version: number
  published_at: string
  data: SnapshotDay[]
}

export async function getSnapshotData(
  snapshotId: string
): Promise<ActionResult<SnapshotDetail>> {
  const { supabase, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'No permission.' }

  const { data, error } = await supabase
    .from('timetable_snapshots')
    .select('version, published_at, data')
    .eq('id', snapshotId)
    .single()

  if (error) {
    Sentry.captureException(error, { tags: { action: 'getSnapshotData.select' } })
    return { success: false, error: 'Could not load this snapshot. Please retry.' }
  }
  if (!data) return { success: false, error: 'Snapshot not found.' }

  return {
    success: true,
    data: {
      version: data.version,
      published_at: data.published_at,
      data: data.data as unknown as SnapshotDay[],
    },
  }
}

// ---------------------------------------------------------------------------
// Audit Log Pagination
// ---------------------------------------------------------------------------

/**
 * Loads all audit log entries for an event (no pagination).
 *
 * Backwards-compat delegator kept for `AuditLogView` (which imports
 * `loadAllAuditLog` + `AuditLogEntry` from this module). The real
 * implementation now lives in `src/app/admin/audit/actions.ts` as
 * `loadAuditLog({ eventId })` — a scope-polymorphic loader that also
 * serves the forthcoming org-audit UI. See DEC-026.
 */
export async function loadAllAuditLog(
  eventId: string
): Promise<ActionResult<{ entries: AuditLogEntry[]; capped: boolean }>> {
  return loadAuditLog({ eventId })
}

/**
 * Loads older audit log entries for cursor-based pagination.
 * Uses created_at as the cursor — returns rows strictly older than the cursor.
 */
export async function loadMoreAuditLog(
  eventId: string,
  cursor: string,
  pageSize: number = 25
): Promise<ActionResult<{ entries: AuditLogEntry[]; hasMore: boolean }>> {
  const { supabase, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'No permission.' }

  const fetchSize = pageSize + 1

  const { data: rows, error } = await supabase
    .from('audit_log')
    .select('*, users:user_id ( email )')
    .eq('event_id', eventId)
    .lt('created_at', cursor)
    .order('created_at', { ascending: false })
    .limit(fetchSize)

  if (error) {
    Sentry.captureException(error, { tags: { action: 'loadMoreAuditLog.select' } })
    return { success: false, error: 'Could not load more audit entries. Please retry.' }
  }

  type AuditRowRaw = {
    id: string
    user_id: string | null
    event_id: string | null
    org_id: string | null
    action: string
    detail: unknown
    actor_context: unknown
    created_at: string
    users: { email: string } | null
  }

  const allRows = (rows ?? []).map((row) => {
    const raw = row as unknown as AuditRowRaw
    return {
      id: raw.id,
      user_id: raw.user_id,
      event_id: raw.event_id,
      org_id: raw.org_id,
      action: raw.action,
      detail: raw.detail as Json | null,
      actor_context: raw.actor_context as Json | null,
      created_at: raw.created_at,
      user_email: raw.users?.email ?? null,
    }
  })

  const hasMore = allRows.length > pageSize
  const entries = hasMore ? allRows.slice(0, pageSize) : allRows

  return { success: true, data: { entries, hasMore } }
}

// ---------------------------------------------------------------------------
// Notification Log (read-only)
// ---------------------------------------------------------------------------

export interface NotificationLogEntry {
  id: string
  event_id: string | null
  type: string
  recipient_email: string
  status: 'queued' | 'sent' | 'failed'
  error: string | null
  sent_at: string | null
  created_at: string
}

/**
 * Loads all notification log entries for an event (no pagination).
 * Mirrors loadAllAuditLog() — used by NotificationLogView to surface
 * previously-invisible notification_log rows to admins.
 * Safety cap: 2000 rows to prevent runaway queries.
 */
export async function loadAllNotificationLog(
  eventId: string
): Promise<ActionResult<{ entries: NotificationLogEntry[]; capped: boolean }>> {
  const { supabase, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'No permission.' }

  const CAP = 2000

  const { data, error } = await supabase
    .from('notification_log')
    .select('id, event_id, type, recipient_email, status, error, sent_at, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(CAP + 1)

  if (error) {
    Sentry.captureException(error, { tags: { action: 'loadAllNotificationLog.select' } })
    return { success: false, error: 'Could not load notification history. Please retry.' }
  }

  const rows = (data ?? []) as NotificationLogEntry[]
  const capped = rows.length > CAP
  const entries = capped ? rows.slice(0, CAP) : rows

  return { success: true, data: { entries, capped } }
}
