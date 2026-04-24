'use server'

import { createClient } from '@/lib/supabase/server'
import { slugify, getDatesInRange, countDaysInRange, MAX_EVENT_DAYS } from '@/lib/utils/slug'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { Json } from '@/lib/types/database'
import { getActiveChampionship } from '@/lib/utils/active-championship'
import { writeAuditLog, makeActorContext } from '@/lib/audit'
import * as Sentry from '@sentry/nextjs'

// ---------------------------------------------------------------------------
// Revalidation helpers
// ---------------------------------------------------------------------------

/**
 * Invalidates Next.js fetch caches for any route that lists templates.
 * The dedicated `/admin/templates` page is the obvious one; the new-event
 * page also reads `listTemplates()` to populate `TemplatePicker`, so its
 * cache must be cleared too.
 */
function revalidateTemplatePaths(): void {
  revalidatePath('/admin/templates')
  revalidatePath('/admin/events/new')
}

// ---------------------------------------------------------------------------
// Helpers (mirrored from events/actions — not exported there)
// ---------------------------------------------------------------------------

async function requireUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return { supabase, user }
}

async function requireEditor() {
  const { supabase, user } = await requireUser()
  const membership = await getActiveChampionship(supabase, user.id)
  return { supabase, user, membership }
}

/**
 * MGT-082: mirrors `computeEventSlug` in events/actions.ts. Scopes the
 * uniqueness check to the target championship and returns a friendly error
 * if the slug is already taken.
 */
async function computeEventSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  championshipId: string,
  title: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const slug = slugify(title) || `event-${Date.now()}`
  const { data, error } = await supabase
    .from('events')
    .select('id')
    .eq('org_id', championshipId)
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    Sentry.captureException(
      new Error(`computeEventSlug.select failed: ${error.message}`),
      { tags: { action: 'createEventFromTemplate.computeEventSlug' } },
    )
    return { ok: false, error: 'Could not verify the event name. Please retry.' }
  }
  if (data) {
    return {
      ok: false,
      error:
        'An event with this title already exists in this championship. Please choose a different title.',
    }
  }
  return { ok: true, slug }
}


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export interface TemplateEntry {
  title: string
  start_time: string
  end_time: string | null
  category: string | null
  notes: string | null
  sort_order: number
  is_break: boolean
}

export interface TemplateDay {
  label: string | null
  sort_order: number
  entries: TemplateEntry[]
}

export interface TemplateSummary {
  id: string
  name: string
  created_at: string
  day_count: number
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function saveAsTemplate(
  eventId: string,
  templateName: string
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'No permission.' }

  if (!templateName.trim()) return { success: false, error: 'Template name is required.' }

  // Fetch event days + entries
  const { data: days } = await supabase
    .from('event_days')
    .select('id, label, sort_order')
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

  // Build template data (date-agnostic)
  const templateData: TemplateDay[] = dayList.map((day) => ({
    label: day.label,
    sort_order: day.sort_order,
    entries: allEntries
      .filter((e) => e.event_day_id === day.id)
      .map(({ event_day_id: _, ...rest }) => rest),
  }))

  const { data: template, error } = await supabase
    .from('templates')
    .insert({
      org_id: membership.org_id,
      name: templateName.trim(),
      data: templateData as unknown as Json,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !template) {
    Sentry.captureException(
      error ?? new Error('saveAsTemplate: no row returned'),
      { tags: { action: 'saveAsTemplate.insert' } }
    )
    return { success: false, error: 'Could not save this template. Please retry.' }
  }

  await writeAuditLog(
    supabase,
    user.id,
    { eventId },
    'template.created',
    {
      template_id: template.id,
      template_name: templateName.trim(),
    },
    makeActorContext(membership),
  )

  revalidateTemplatePaths()

  return { success: true, data: { id: template.id } }
}

export async function listTemplates(): Promise<ActionResult<TemplateSummary[]>> {
  const { supabase, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'No permission.' }

  const { data, error } = await supabase
    .from('templates')
    .select('id, name, data, created_at')
    .eq('org_id', membership.org_id)
    .order('created_at', { ascending: false })

  if (error) {
    Sentry.captureException(error, { tags: { action: 'listTemplates.select' } })
    return { success: false, error: 'Could not load templates. Please retry.' }
  }

  const templates: TemplateSummary[] = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    created_at: t.created_at,
    day_count: Array.isArray(t.data) ? t.data.length : 0,
  }))

  return { success: true, data: templates }
}

export async function deleteTemplate(templateId: string): Promise<ActionResult> {
  const { supabase, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'No permission.' }

  const { error } = await supabase
    .from('templates')
    .delete()
    .eq('id', templateId)

  if (error) {
    Sentry.captureException(error, { tags: { action: 'deleteTemplate.delete' } })
    return { success: false, error: 'Could not delete this template. Please retry.' }
  }

  revalidateTemplatePaths()

  return { success: true, data: undefined }
}

export interface CreateFromTemplateInput {
  title: string
  venue: string
  start_date: string
  end_date: string
  timezone: string
  notes: string
}

export async function createEventFromTemplate(
  templateId: string,
  input: CreateFromTemplateInput
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, membership } = await requireEditor()
  if (!membership) return { success: false, error: 'No permission.' }

  if (!input.title.trim()) return { success: false, error: 'Event title is required.' }
  if (!input.start_date || !input.end_date) return { success: false, error: 'Dates are required.' }

  // Enforce the event day-span limit before touching the DB so we never
  // silently drop template days or date-range days.
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

  // Fetch template
  const { data: template, error: tplErr } = await supabase
    .from('templates')
    .select('name, data')
    .eq('id', templateId)
    .single()

  if (tplErr || !template) return { success: false, error: 'Template not found.' }

  const templateDays = template.data as unknown as TemplateDay[]
  if (!Array.isArray(templateDays)) return { success: false, error: 'Invalid template data.' }

  // Create the event
  const slugResult = await computeEventSlug(supabase, membership.org_id, input.title)
  if (!slugResult.ok) {
    return { success: false, error: slugResult.error }
  }
  const slug = slugResult.slug

  const { data: event, error: eventErr } = await supabase
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

  if (eventErr || !event) {
    Sentry.captureException(
      eventErr ?? new Error('createEventFromTemplate: no row returned'),
      { tags: { action: 'createEventFromTemplate.insertEvent' } }
    )
    return { success: false, error: 'Could not create this event from template. Please retry.' }
  }

  // Generate dates for the new event
  const newDates = getDatesInRange(input.start_date, input.end_date)

  // Map template days to new dates by index
  // If template has more days than date range, extra template days are dropped
  // If date range has more dates than template days, extra dates get empty days
  let failureReason: 'day' | 'entry' | null = null

  for (let i = 0; i < newDates.length; i++) {
    const tplDay = i < templateDays.length ? templateDays[i] : null

    const { data: newDay, error: dayErr } = await supabase
      .from('event_days')
      .insert({
        event_id: event.id,
        date: newDates[i],
        label: tplDay?.label ?? null,
        sort_order: i,
      })
      .select('id')
      .single()

    if (dayErr || !newDay) {
      Sentry.captureException(
        dayErr ?? new Error('createEventFromTemplate: day insert returned no row'),
        {
          tags: { action: 'createEventFromTemplate.insertDay' },
          extra: { templateId, dayIndex: i },
        }
      )
      failureReason = 'day'
      break
    }

    // Insert entries from template day
    if (tplDay && tplDay.entries.length > 0) {
      const { error: entriesErr } = await supabase.from('timetable_entries').insert(
        tplDay.entries.map((e) => ({
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
        Sentry.captureException(entriesErr, {
          tags: { action: 'createEventFromTemplate.insertEntries' },
          extra: { templateId, dayIndex: i },
        })
        failureReason = 'entry'
        break
      }
    }
  }

  if (failureReason) {
    // Roll back the partially-created event so the user doesn't end up
    // with a silently-incomplete event. Cascade deletes remove any
    // already-inserted days and entries. The underlying error was already
    // captured to Sentry at the point of failure with a distinct sub-tag.
    await supabase.from('events').delete().eq('id', event.id)
    return { success: false, error: 'Could not create this event from template. Please retry.' }
  }

  await writeAuditLog(
    supabase,
    user.id,
    { eventId: event.id },
    'event.created_from_template',
    {
      template_id: templateId,
      template_name: template.name,
    },
    makeActorContext(membership),
  )

  revalidateTemplatePaths()
  revalidatePath('/admin/events')

  return { success: true, data: { id: event.id } }
}
