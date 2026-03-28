'use server'

import { createClient } from '@/lib/supabase/server'
import { slugify, getDatesInRange } from '@/lib/utils/slug'
import { redirect } from 'next/navigation'
import type { EventStatus, Json } from '@/lib/types/database'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function requireUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return { supabase, user }
}

async function getUserOrg(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', userId)
    .limit(1)
    .single()
  if (error || !data) return null
  return data
}

async function generateUniqueSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  title: string
): Promise<string> {
  const base = slugify(title) || `event-${Date.now()}`
  const { data } = await supabase
    .from('events')
    .select('slug')
    .ilike('slug', `${base}%`)
  const existing = (data ?? []).map((r) => r.slug)
  if (!existing.includes(base)) return base
  let i = 2
  while (existing.includes(`${base}-${i}`)) i++
  return `${base}-${i}`
}

async function writeAuditLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  const { supabase, user } = await requireUser()

  const membership = await getUserOrg(supabase, user.id)
  if (!membership) {
    return { success: false, error: 'You are not a member of any organisation. Ask your administrator to add you.' }
  }

  const slug = await generateUniqueSlug(supabase, input.title)

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

  if (eventError || !event) {
    return { success: false, error: eventError?.message ?? 'Failed to create event' }
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
      return { success: false, error: daysError.message }
    }
  }

  await writeAuditLog(supabase, user.id, event.id, 'event.created', {
    title: input.title,
    slug,
  })

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
}

export async function updateEventMetadata(
  eventId: string,
  input: UpdateEventMetadataInput
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()

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
    })
    .eq('id', eventId)

  if (error) return { success: false, error: error.message }

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
    await writeAuditLog(supabase, user.id, eventId, 'event.updated',
      Object.keys(changes).length > 0 ? { changes } : undefined
    )
  } else {
    await writeAuditLog(supabase, user.id, eventId, 'event.updated')
  }

  return { success: true, data: undefined }
}

// ---------------------------------------------------------------------------

export async function publishEvent(eventId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()

  const { error } = await supabase
    .from('events')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', eventId)

  if (error) return { success: false, error: error.message }

  await writeAuditLog(supabase, user.id, eventId, 'event.published')
  return { success: true, data: undefined }
}

export async function unpublishEvent(eventId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()

  const { error } = await supabase
    .from('events')
    .update({ status: 'draft' })
    .eq('id', eventId)

  if (error) return { success: false, error: error.message }

  await writeAuditLog(supabase, user.id, eventId, 'event.unpublished')
  return { success: true, data: undefined }
}

export async function archiveEvent(eventId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()

  const { error } = await supabase
    .from('events')
    .update({ status: 'archived' })
    .eq('id', eventId)

  if (error) return { success: false, error: error.message }

  await writeAuditLog(supabase, user.id, eventId, 'event.archived')
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
  const { supabase, user } = await requireUser()

  // Fetch source event
  const { data: source, error: srcErr } = await supabase
    .from('events')
    .select('*')
    .eq('id', sourceEventId)
    .single()

  if (srcErr || !source) return { success: false, error: 'Source event not found' }

  const slug = await generateUniqueSlug(supabase, input.title)

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

  if (newErr || !newEvent) return { success: false, error: newErr?.message ?? 'Failed to duplicate event' }

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

      if (dayErr || !newDay) continue

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
        await supabase.from('timetable_entries').insert(
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
      }
    }
  }

  await writeAuditLog(supabase, user.id, newEvent.id, 'event.duplicated', {
    source_event_id: sourceEventId,
    title: input.title,
  })

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
  const { supabase } = await requireUser()

  // Get current max sort_order for this event
  const { data: existing } = await supabase
    .from('event_days')
    .select('sort_order')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

  const { data, error } = await supabase
    .from('event_days')
    .insert({
      event_id: eventId,
      date,
      label: label?.trim() || null,
      sort_order: nextOrder,
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'Failed to add day' }
  return { success: true, data: { id: data.id } }
}

export async function removeEventDay(dayId: string): Promise<ActionResult> {
  const { supabase } = await requireUser()

  // Cascade: delete entries first (RLS may require explicit delete)
  await supabase.from('timetable_entries').delete().eq('event_day_id', dayId)

  const { error } = await supabase.from('event_days').delete().eq('id', dayId)
  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}

export async function updateDayLabel(dayId: string, label: string): Promise<ActionResult> {
  const { supabase } = await requireUser()

  const { error } = await supabase
    .from('event_days')
    .update({ label: label.trim() || null })
    .eq('id', dayId)

  if (error) return { success: false, error: error.message }
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
  deletedIds: string[]
): Promise<ActionResult<{ savedIds: (string | null)[] }>> {
  const { supabase, user } = await requireUser()

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
    if (delError) return { success: false, error: delError.message }
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
    if (updErr) return { success: false, error: updErr.message }
    toUpdate.forEach((e) => {
      savedIds[entries.indexOf(e)] = e.id
    })
  }

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

    if (!insErr && data) {
      savedIds[entries.indexOf(e)] = data.id
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

  if (Object.keys(detail).length > 0) {
    await writeAuditLog(supabase, user.id, eventId, 'timetable.updated', detail)
  }

  return { success: true, data: { savedIds } }
}
