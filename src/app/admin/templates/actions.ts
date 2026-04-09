'use server'

import { createClient } from '@/lib/supabase/server'
import { slugify, getDatesInRange } from '@/lib/utils/slug'
import { redirect } from 'next/navigation'
import type { Json } from '@/lib/types/database'

// ---------------------------------------------------------------------------
// Helpers (mirrored from events/actions — not exported there)
// ---------------------------------------------------------------------------

async function requireUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return { supabase, user }
}

const EDITOR_ROLES = ['owner', 'admin', 'editor'] as const

async function requireEditor() {
  const { supabase, user } = await requireUser()
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .in('role', [...EDITOR_ROLES])
    .limit(1)
    .maybeSingle()
  return { supabase, user, membership: membership ?? null }
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

  if (error || !template) return { success: false, error: error?.message ?? 'Failed to save template.' }

  await writeAuditLog(supabase, user.id, eventId, 'template.created', {
    template_id: template.id,
    template_name: templateName.trim(),
  })

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

  if (error) return { success: false, error: error.message }

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

  if (error) return { success: false, error: error.message }
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
  const slug = await generateUniqueSlug(supabase, input.title)

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

  if (eventErr || !event) return { success: false, error: eventErr?.message ?? 'Failed to create event.' }

  // Generate dates for the new event
  const newDates = getDatesInRange(input.start_date, input.end_date)

  // Map template days to new dates by index
  // If template has more days than date range, extra template days are dropped
  // If date range has more dates than template days, extra dates get empty days
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

    if (dayErr || !newDay) continue

    // Insert entries from template day
    if (tplDay && tplDay.entries.length > 0) {
      await supabase.from('timetable_entries').insert(
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
    }
  }

  await writeAuditLog(supabase, user.id, event.id, 'event.created_from_template', {
    template_id: templateId,
    template_name: template.name,
  })

  return { success: true, data: { id: event.id } }
}
