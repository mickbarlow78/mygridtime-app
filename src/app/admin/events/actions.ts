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
  detail?: Record<string, string>
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

  await writeAuditLog(supabase, user.id, eventId, 'event.updated', {
    title: input.title,
  })

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
 * Saves a complete set of entries for a single day.
 * - Upserts entries that have an id (existing) or inserts new ones.
 * - Deletes entries by id that are in deletedIds.
 */
export async function saveDayEntries(
  entries: EntryInput[],
  deletedIds: string[]
): Promise<ActionResult<{ savedIds: (string | null)[] }>> {
  const { supabase } = await requireUser()

  // Delete removed entries
  if (deletedIds.length > 0) {
    const { error: delError } = await supabase
      .from('timetable_entries')
      .delete()
      .in('id', deletedIds)
    if (delError) return { success: false, error: delError.message }
  }

  if (entries.length === 0) return { success: true, data: { savedIds: [] } }

  // Split into inserts and updates
  const toInsert = entries.filter((e) => !e.id)
  const toUpdate = entries.filter((e) => !!e.id)

  const savedIds: (string | null)[] = new Array(entries.length).fill(null)

  // Batch upsert existing entries
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
      const idx = entries.indexOf(e)
      savedIds[idx] = e.id
    })
  }

  // Insert new entries one by one to get their IDs back
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
      const idx = entries.indexOf(e)
      savedIds[idx] = data.id
    }
  }

  return { success: true, data: { savedIds } }
}
