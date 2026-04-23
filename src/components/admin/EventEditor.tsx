'use client'

import { useMemo, useState, useTransition } from 'react'
import { debugLog } from '@/lib/debug'
import { useRouter } from 'next/navigation'
import { TimetableBuilder } from './TimetableBuilder'
import { AuditLogView } from './AuditLogView'
import { NotificationLogView } from './NotificationLogView'
import { EventActionsBar } from './EventActionsBar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ReviewModal, type ReviewCard, type ChangeCard } from '@/components/ui/ReviewModal'
import { cn, CARD, CARD_PADDING, H2, HELP_TEXT, INPUT, LABEL_COMPACT, ERROR_BANNER } from '@/lib/styles'
import {
  updateEventMetadata,
  publishEvent,
  unpublishEvent,
  archiveEvent,
  duplicateEvent,
  saveDayEntries,
  type ActionResult,
  type EntryInput,
} from '@/app/admin/events/actions'
import type { EntryDraft, EntryValidationError, EntryChangeInfo } from './EntryRow'
import type { Event, EventDay, TimetableEntry, AuditLog } from '@/lib/types/database'
import type { VersionSummary, NotificationLogEntry } from '@/app/admin/events/actions'
import { VersionHistory } from './VersionHistory'
import { saveAsTemplate } from '@/app/admin/templates/actions'
import { FIELD_LIMITS } from '@/lib/constants/field-limits'
import { CharCounter } from '@/components/ui/CharCounter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuditEntry = AuditLog & { user_email?: string | null }

interface EventEditorProps {
  event: Event
  days: EventDay[]
  entries: TimetableEntry[]
  auditLog: AuditEntry[]
  auditHasMore: boolean
  auditLoadError?: string | null
  notificationLog: NotificationLogEntry[]
  notificationHasMore: boolean
  notificationLoadError?: string | null
  versions: VersionSummary[]
  versionsLoadError?: string | null
  unsubscribedEmails?: string[]
  /** MGT-082: slug of the owning organisation — required to build the
   *  canonical public URL `/{orgSlug}/{eventSlug}`. */
  orgSlug: string
}

interface SavedMeta {
  title: string
  venue: string
  start_date: string
  end_date: string
  timezone: string
  notes: string
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

/** Stripped entry values captured at copy time — no server IDs, no DnD keys. */
interface ClipboardEntry {
  title: string
  start_time: string
  end_time: string
  category: string
  notes: string
  is_break: boolean
}

/**
 * In-memory clipboard for day-level copy/paste.
 * Scoped to the current editor session — cleared on unmount.
 */
export interface DayClipboard {
  sourceEventId: string
  sourceDayId: string
  /** Display label captured at copy time (e.g. "Saturday Practice"). */
  sourceDayLabel: string | null
  entries: ClipboardEntry[]
  copiedAt: number
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean
  globalErrors: string[]
  entryErrors: Record<string, EntryValidationError[]>
}

function validateTimetable(
  days: EventDay[],
  dayEntries: Record<string, EntryDraft[]>
): ValidationResult {
  const globalErrors: string[] = []
  const entryErrors: Record<string, EntryValidationError[]> = {}

  if (days.length === 0) globalErrors.push('Event must have at least one day.')

  for (const day of days) {
    const entries = dayEntries[day.id] ?? []
    const dayErrs: EntryValidationError[] = []

    if (entries.length === 0)
      globalErrors.push(`Day "${day.label ?? day.date}" has no entries. Add at least one or remove the day.`)

    for (const entry of entries) {
      const fields: string[] = []
      const messages: string[] = []
      if (!entry.title.trim())          { fields.push('title');      messages.push('Title is required.') }
      if (!entry.start_time)            { fields.push('start_time'); messages.push('Start time is required.') }
      if (entry.end_time && entry.start_time && entry.end_time <= entry.start_time)
        { fields.push('end_time'); messages.push('End time must be after start time.') }
      if (fields.length > 0) dayErrs.push({ _localId: entry._localId, fields, messages })
    }
    if (dayErrs.length > 0) entryErrors[day.id] = dayErrs
  }

  const valid = globalErrors.length === 0 &&
    Object.values(entryErrors).every((errs) => errs.every((e) => e.fields.length === 0))
  return { valid, globalErrors, entryErrors }
}

// ---------------------------------------------------------------------------
// Pure diff helpers
// ---------------------------------------------------------------------------

const nTime = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null)

const META_FIELDS = ['title', 'venue', 'start_date', 'end_date', 'timezone', 'notes'] as const
const META_LABELS: Record<string, string> = {
  title: 'Title', venue: 'Venue', start_date: 'Start date',
  end_date: 'End date', timezone: 'Timezone', notes: 'Notes',
}

function computeMetaCards(
  saved: SavedMeta,
  current: SavedMeta,
  rejected: Set<string>
): ReviewCard[] {
  return META_FIELDS.flatMap((field) => {
    const from = saved[field] || null
    const to   = current[field] || null
    if (from === to) return []
    return [{ kind: 'meta-field' as const, id: field, label: META_LABELS[field], from, to,
               status: rejected.has(field) ? 'rejected' : 'pending' }]
  })
}

function computeTimetableCards(
  savedEntries: Record<string, EntryDraft[]>,
  currentEntries: Record<string, EntryDraft[]>,
  deletedIds: string[],
  rejectedAddedLocalIds: Set<string>,
  rejectedEditedIds: Set<string>,
  days: EventDay[]
): ReviewCard[] {
  const cards: ReviewCard[] = []
  const deletedSet = new Set(deletedIds)

  const savedById: Record<string, EntryDraft> = {}
  for (const arr of Object.values(savedEntries))
    for (const e of arr) { if (e.id) savedById[e.id] = e }

  const allCurrent = days.flatMap((d) => currentEntries[d.id] ?? [])

  // Added
  for (const e of allCurrent) {
    if (e.id !== null) continue
    cards.push({
      kind: 'entry-added', id: e._localId,
      title: e.title.trim() || '(untitled)',
      start_time: nTime(e.start_time) ?? '',
      end_time: nTime(e.end_time),
      category: e.category.trim() || null,
      is_break: e.is_break,
      status: rejectedAddedLocalIds.has(e._localId) ? 'rejected' : 'pending',
    })
  }

  // Removed
  for (const id of deletedIds) {
    const saved = savedById[id]
    if (!saved) continue
    cards.push({
      kind: 'entry-removed', id,
      title: saved.title,
      start_time: nTime(saved.start_time) ?? '',
      end_time: nTime(saved.end_time),
      category: saved.category || null,
      // entry-removed cards are never in a "rejected" state in the set;
      // rejection has immediate effect (entry restored), so they disappear.
      status: 'pending',
    })
  }

  // Edited
  for (const e of allCurrent) {
    if (!e.id || deletedSet.has(e.id)) continue
    const saved = savedById[e.id]
    if (!saved) continue

    const changes: Record<string, { from: unknown; to: unknown }> = {}
    const cTitle = e.title.trim()
    if (cTitle !== saved.title.trim())              changes.title      = { from: saved.title,              to: cTitle }
    if (nTime(e.start_time) !== nTime(saved.start_time)) changes.start_time = { from: nTime(saved.start_time), to: nTime(e.start_time) }
    if (nTime(e.end_time)   !== nTime(saved.end_time))   changes.end_time   = { from: nTime(saved.end_time),   to: nTime(e.end_time) }
    const cCat = e.category.trim() || null, sCat = saved.category || null
    if (cCat !== sCat) changes.category = { from: sCat, to: cCat }
    const cNotes = e.notes.trim() || null, sNotes = saved.notes || null
    if (cNotes !== sNotes) changes.notes = { from: sNotes, to: cNotes }
    if (e.is_break !== saved.is_break) changes.is_break = { from: saved.is_break, to: e.is_break }

    if (Object.keys(changes).length === 0) continue
    cards.push({
      kind: 'entry-edited', id: e.id,
      title: e.title.trim() || saved.title,
      changes,
      status: rejectedEditedIds.has(e.id) ? 'rejected' : 'pending',
    })
  }

  // Reordered
  const savedOrder = Object.values(savedEntries).flat()
    .filter((e) => e.id && !deletedSet.has(e.id as string))
    .sort((a, b) => a.sort_order - b.sort_order).map((e) => e.id as string)
  const currentOrder = allCurrent
    .filter((e) => e.id && !deletedSet.has(e.id as string))
    .sort((a, b) => a.sort_order - b.sort_order).map((e) => e.id as string)
  if (savedOrder.length === currentOrder.length && savedOrder.length > 0 &&
      savedOrder.some((id, i) => id !== currentOrder[i])) {
    const ordered = allCurrent
      .filter((e) => e.id && !deletedSet.has(e.id as string))
      .sort((a, b) => a.sort_order - b.sort_order)
    cards.push({
      kind: 'entry-reordered', id: 'reorder',
      titles: ordered.map((e) => e.title.trim() || '(untitled)'),
      status: 'pending',
    })
  }

  return cards
}

/** Compute per-entry change info for live editor highlighting. */
function computeEntryChangeInfos(
  savedEntries: Record<string, EntryDraft[]>,
  currentEntries: Record<string, EntryDraft[]>,
  rejectedAddedLocalIds: Set<string>,
  rejectedEditedIds: Set<string>,
  days: EventDay[]
): Record<string, EntryChangeInfo> {
  const infos: Record<string, EntryChangeInfo> = {}
  const savedById: Record<string, EntryDraft> = {}
  for (const arr of Object.values(savedEntries))
    for (const e of arr) { if (e.id) savedById[e.id] = e }

  for (const day of days) {
    for (const e of currentEntries[day.id] ?? []) {
      if (e.id === null) {
        infos[e._localId] = {
          rowKind: 'added',
          rowStatus: rejectedAddedLocalIds.has(e._localId) ? 'rejected' : 'pending',
          changedFields: new Set(),
          savedValues: {},
        }
        continue
      }
      const saved = savedById[e.id]
      if (!saved) continue

      const changedFields = new Set<string>()
      if (e.title.trim() !== saved.title.trim())              changedFields.add('title')
      if (nTime(e.start_time) !== nTime(saved.start_time))    changedFields.add('start_time')
      if (nTime(e.end_time)   !== nTime(saved.end_time))      changedFields.add('end_time')
      if ((e.category.trim() || null) !== (saved.category || null)) changedFields.add('category')
      if ((e.notes.trim() || null)    !== (saved.notes || null))    changedFields.add('notes')
      if (e.is_break !== saved.is_break)                      changedFields.add('is_break')

      if (changedFields.size === 0) continue
      infos[e._localId] = {
        rowKind: 'edited',
        rowStatus: rejectedEditedIds.has(e.id) ? 'rejected' : 'pending',
        changedFields,
        savedValues: {
          title: saved.title, start_time: saved.start_time,
          end_time: saved.end_time ?? '', category: saved.category ?? '',
          notes: saved.notes ?? '', is_break: saved.is_break,
        },
      }
    }
  }
  return infos
}

// ---------------------------------------------------------------------------
// Build initial entry state from database rows
// ---------------------------------------------------------------------------

// Stable serialize for dirty detection — excludes _localId (ephemeral UUID,
// differs between the two buildDayEntries calls that seed dayEntries and
// savedDayEntries, so must not be included in equality checks).
function serializeDayEntries(entries: Record<string, EntryDraft[]>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(entries).map(([k, v]) => [
        k,
        v.map(({ _localId: _omit, ...rest }) => rest),
      ])
    )
  )
}

function buildDayEntries(days: EventDay[], entries: TimetableEntry[]): Record<string, EntryDraft[]> {
  const map: Record<string, EntryDraft[]> = {}
  for (const day of days) {
    map[day.id] = entries
      .filter((e) => e.event_day_id === day.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((e) => ({
        _localId: crypto.randomUUID(),
        id: e.id,
        event_day_id: e.event_day_id,
        title: e.title,
        start_time: e.start_time,
        end_time: e.end_time ?? '',
        category: e.category ?? '',
        notes: e.notes ?? '',
        sort_order: e.sort_order,
        is_break: e.is_break,
      }))
  }
  return map
}

// ---------------------------------------------------------------------------
// Metadata field styling
// ---------------------------------------------------------------------------

type MetaFieldState = 'unchanged' | 'pending' | 'rejected'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventEditor({ event, days: initialDays, entries: initialEntries, auditLog, auditHasMore, auditLoadError = null, notificationLog, notificationHasMore, notificationLoadError = null, versions, versionsLoadError = null, unsubscribedEmails = [], orgSlug }: EventEditorProps) {
  debugLog('EventEditor', 'loaded')
  const router = useRouter()
  const [, startTransition] = useTransition()

  // ── Metadata state ──────────────────────────────────────────────────────
  const [title,     setTitle]     = useState(event.title)
  const [venue,     setVenue]     = useState(event.venue ?? '')
  const [startDate, setStartDate] = useState(event.start_date)
  const [endDate,   setEndDate]   = useState(event.end_date)
  const [timezone,  setTimezone]  = useState(event.timezone)
  const [notes,     setNotes]     = useState(event.notes ?? '')
  const [status,    setStatus]    = useState(event.status)

  const [savedMeta, setSavedMeta] = useState<SavedMeta>({
    title: event.title, venue: event.venue ?? '',
    start_date: event.start_date, end_date: event.end_date,
    timezone: event.timezone, notes: event.notes ?? '',
  })

  // notification_emails — admin-only config, not part of the review/diff flow.
  // Stored as text[] in DB; displayed as comma-separated in the editor.
  const [notificationEmails,      setNotificationEmails]      = useState(
    (event.notification_emails ?? []).join(', ')
  )
  const [savedNotificationEmails, setSavedNotificationEmails] = useState(
    (event.notification_emails ?? []).join(', ')
  )

  const [metaError,   setMetaError]   = useState<string | null>(null)
  const [metaSuccess, setMetaSuccess] = useState(false)

  // Rejection sets — metadata
  const [rejectedMetaFields, setRejectedMetaFields] = useState<Set<string>>(new Set())

  // ── Timetable state ─────────────────────────────────────────────────────
  const [days,       setDays]       = useState<EventDay[]>(initialDays)
  const [dayEntries, setDayEntries] = useState<Record<string, EntryDraft[]>>(
    () => buildDayEntries(initialDays, initialEntries)
  )
  const [savedDayEntries, setSavedDayEntries] = useState<Record<string, EntryDraft[]>>(
    () => buildDayEntries(initialDays, initialEntries)
  )
  const [deletedEntryIds, setDeletedEntryIds] = useState<string[]>([])

  const [timetableError,   setTimetableError]   = useState<string | null>(null)
  const [timetableSuccess, setTimetableSuccess] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, EntryValidationError[]>>({})
  const [globalValidationErrors, setGlobalValidationErrors] = useState<string[]>([])

  // Rejection sets — timetable
  const [rejectedAddedLocalIds, setRejectedAddedLocalIds] = useState<Set<string>>(new Set())
  const [rejectedEditedIds,     setRejectedEditedIds]     = useState<Set<string>>(new Set())

  // ── Review modal state ──────────────────────────────────────────────────
  // MGT-096: 'unified' mode lists metadata + timetable cards together so a
  // single Save CTA commits both domains in one review pass.
  const [reviewOpen,   setReviewOpen]   = useState(false)
  const [reviewMode,   setReviewMode]   = useState<'metadata' | 'timetable' | 'unified' | null>(null)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [unifiedError, setUnifiedError] = useState<string | null>(null)
  const [unifiedSuccess, setUnifiedSuccess] = useState(false)

  // ── Dialog state ─────────────────────────────────────────────────────────
  type DialogKind = 'publish' | 'unpublish' | 'archive' | 'duplicate' | 'saveTemplate'
  const [dialog,        setDialog]        = useState<DialogKind | null>(null)
  const [dialogPending, setDialogPending] = useState(false)
  const [dialogError,   setDialogError]   = useState<string | null>(null)
  const [dupTitle,      setDupTitle]      = useState(event.title + ' (copy)')
  const [dupStartDate,  setDupStartDate]  = useState(event.start_date)
  const [dupEndDate,    setDupEndDate]    = useState(event.end_date)
  const [templateName,  setTemplateName]  = useState(event.title + ' Template')
  const [templateSuccess, setTemplateSuccess] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const [publishAck, setPublishAck] = useState(false)
  const [notifyOnPublish, setNotifyOnPublish] = useState(false)
  const [publishUrlCopied, setPublishUrlCopied] = useState(false)
  const [clipboard, setClipboard] = useState<DayClipboard | null>(null)
  const [auditRefreshSignal, setAuditRefreshSignal] = useState(0)
  const [notificationRefreshSignal, setNotificationRefreshSignal] = useState(0)

  // ── Public URL (read-only, derived from org + event slugs) ──────────────
  // MGT-082: canonical public URL is nested under the owning org.
  const publicUrl = (() => {
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    const path = `/${orgSlug}/${event.slug}`
    return base ? `${base}${path}` : path
  })()

  // ── Derived: current meta as SavedMeta ───────────────────────────────────
  const currentMeta = useMemo((): SavedMeta => ({
    title: title.trim(), venue, start_date: startDate,
    end_date: endDate, timezone, notes,
  }), [title, venue, startDate, endDate, timezone, notes])

  // ── Derived: review cards (reactive — updates as user accepts/rejects) ───
  const reviewCards = useMemo((): ReviewCard[] => {
    if (reviewMode === null) return []
    if (reviewMode === 'metadata')
      return computeMetaCards(savedMeta, currentMeta, rejectedMetaFields)
    if (reviewMode === 'timetable')
      return computeTimetableCards(
        savedDayEntries, dayEntries, deletedEntryIds,
        rejectedAddedLocalIds, rejectedEditedIds, days
      )
    // unified — metadata cards first, then timetable cards
    return [
      ...computeMetaCards(savedMeta, currentMeta, rejectedMetaFields),
      ...computeTimetableCards(
        savedDayEntries, dayEntries, deletedEntryIds,
        rejectedAddedLocalIds, rejectedEditedIds, days
      ),
    ]
  }, [reviewMode, savedMeta, currentMeta, rejectedMetaFields,
      savedDayEntries, dayEntries, deletedEntryIds, rejectedAddedLocalIds, rejectedEditedIds, days])

  // ── Derived: entry change infos for live highlighting ───────────────────
  const entryChangeInfos = useMemo(
    () => computeEntryChangeInfos(savedDayEntries, dayEntries, rejectedAddedLocalIds, rejectedEditedIds, days),
    [savedDayEntries, dayEntries, rejectedAddedLocalIds, rejectedEditedIds, days]
  )

  // ── Derived: unsaved-changes awareness ───────────────────────────────────
  const metaDirty = useMemo(
    () => META_FIELDS.some((k) => (currentMeta[k] || null) !== (savedMeta[k] || null)) || notificationEmails !== savedNotificationEmails,
    [currentMeta, savedMeta, notificationEmails, savedNotificationEmails]
  )
  const timetableDirty = useMemo(
    () => serializeDayEntries(dayEntries) !== serializeDayEntries(savedDayEntries) || deletedEntryIds.length > 0,
    [dayEntries, savedDayEntries, deletedEntryIds]
  )
  const isDirty = metaDirty || timetableDirty

  // ── Derived: saved entries by db id for field revert ────────────────────
  const savedEntriesById = useMemo((): Record<string, EntryDraft> => {
    const map: Record<string, EntryDraft> = {}
    for (const arr of Object.values(savedDayEntries))
      for (const e of arr) { if (e.id) map[e.id] = e }
    return map
  }, [savedDayEntries])

  // ---------------------------------------------------------------------------
  // Meta field state helpers
  // ---------------------------------------------------------------------------

  function metaFieldState(field: string, current: string): MetaFieldState {
    if ((current || null) === (savedMeta[field as keyof SavedMeta] || null)) return 'unchanged'
    return rejectedMetaFields.has(field) ? 'rejected' : 'pending'
  }

  function metaInputClass(field: string, current: string): string {
    const state = metaFieldState(field, current)
    const base = 'w-full text-sm px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent'
    if (state === 'pending')  return `${base} border-amber-400 bg-amber-50 focus:ring-amber-400`
    if (state === 'rejected') return `${base} border-red-400 bg-red-50 focus:ring-red-400`
    return `${base} border-gray-300 focus:ring-gray-900`
  }

  function handleRevertMetaField(field: string) {
    const v = savedMeta[field as keyof SavedMeta]
    switch (field) {
      case 'title':      setTitle(v);     break
      case 'venue':      setVenue(v);     break
      case 'start_date': setStartDate(v); break
      case 'end_date':   setEndDate(v);   break
      case 'timezone':   setTimezone(v);  break
      case 'notes':      setNotes(v);     break
    }
    setRejectedMetaFields((prev) => { const s = new Set(prev); s.delete(field); return s })
  }

  // Label row for a meta field: label + optional counter + optional revert button
  function MetaFieldLabel({ label, field, current, max }: { label: string; field: string; current: string; max?: number }) {
    const state = metaFieldState(field, current)
    return (
      <div className="flex items-center justify-between mb-1 gap-2">
        <label className="block text-xs font-medium text-gray-600">{label}</label>
        <div className="flex items-center gap-2">
          {max !== undefined && <CharCounter used={current.length} max={max} />}
          {state !== 'unchanged' && (
            <button
              type="button"
              onClick={() => handleRevertMetaField(field)}
              className={cn(
                'text-xs underline underline-offset-2',
                state === 'rejected' ? 'text-red-500 hover:text-red-700' : 'text-amber-600 hover:text-amber-800',
              )}
            >
              ↩ revert
            </button>
          )}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Status actions
  // ---------------------------------------------------------------------------

  async function handleStatusAction(kind: DialogKind) {
    setDialogPending(true)
    setDialogError(null)

    let result: ActionResult | ActionResult<{ id: string }> | undefined
    if (kind === 'publish') {
      const validation = validateTimetable(days, dayEntries)
      if (!validation.valid) {
        setValidationErrors(validation.entryErrors)
        setGlobalValidationErrors(validation.globalErrors)
        setDialog(null)
        setDialogPending(false)
        document.getElementById('timetable-section')?.scrollIntoView({ behavior: 'smooth' })
        return
      }
      result = await publishEvent(event.id, notifyOnPublish)
    } else if (kind === 'unpublish') {
      result = await unpublishEvent(event.id)
    } else if (kind === 'archive') {
      result = await archiveEvent(event.id)
    } else if (kind === 'duplicate') {
      if (!dupTitle.trim() || !dupStartDate || !dupEndDate) {
        setDialogError('Please fill in all fields.')
        setDialogPending(false)
        return
      }
      const dupResult = await duplicateEvent(event.id, {
        title: dupTitle.trim(), start_date: dupStartDate, end_date: dupEndDate,
      })
      if (dupResult.success) {
        startTransition(() => router.push(`/admin/events/${dupResult.data.id}`))
        setDialog(null)
        return
      }
      result = dupResult
    }

    setDialogPending(false)
    if (!result || !result.success) { setDialogError(result?.error ?? 'Something went wrong.'); return }

    if (kind === 'publish')   setStatus('published')
    else if (kind === 'unpublish') setStatus('draft')
    else if (kind === 'archive')   setStatus('archived')
    setDialog(null)
  }

  // ---------------------------------------------------------------------------
  // MGT-096: Unified save — single commit entry point for metadata + timetable
  // ---------------------------------------------------------------------------

  async function runUnifiedSave(
    rejectedMeta: Set<string>,
    rejAddedLocalIds: Set<string>,
    rejEditedIds: Set<string>,
    notify: boolean,
  ): Promise<void> {
    setUnifiedError(null)
    setUnifiedSuccess(false)

    const metaCards = computeMetaCards(savedMeta, currentMeta, rejectedMeta)
    const tableCards = computeTimetableCards(
      savedDayEntries, dayEntries, deletedEntryIds,
      rejAddedLocalIds, rejEditedIds, days,
    )
    const emailsChanged = notificationEmails !== savedNotificationEmails

    const metaHasWork = metaCards.length > 0 || emailsChanged
    const tableHasWork = tableCards.length > 0

    let metaOk = true
    if (metaHasWork) {
      metaOk = await performMetaSave(rejectedMeta)
      if (!metaOk) {
        setUnifiedError(metaError ?? 'Details save failed.')
        return
      }
    }

    if (tableHasWork) {
      const tableOk = await performTimetableSave(rejAddedLocalIds, rejEditedIds, notify)
      if (!tableOk) {
        setUnifiedError(
          metaHasWork
            ? 'Timetable save failed after saving details. Retry the save to complete.'
            : (timetableError ?? 'Timetable save failed.'),
        )
        return
      }
    }

    setUnifiedSuccess(true)
    setTimeout(() => setUnifiedSuccess(false), 3000)
  }

  /**
   * MGT-096: the single Save CTA handler. Validates both domains, then either
   * opens the unified review modal or direct-saves when there are no
   * reviewable change cards (e.g. notification_emails-only edit).
   */
  async function handleUnifiedSave(e?: React.FormEvent): Promise<void> {
    e?.preventDefault()
    if (reviewSaving) return

    // Metadata validation gates (lifted from handleSaveMetadata)
    if (!title.trim())          { setMetaError('Title is required.');                        setUnifiedError('Title is required.');                        return }
    if (!startDate || !endDate) { setMetaError('Start and end dates are required.');         setUnifiedError('Start and end dates are required.');         return }
    if (endDate < startDate)    { setMetaError('End date must be on or after start date.'); setUnifiedError('End date must be on or after start date.'); return }

    setMetaError(null)

    // Timetable validation gate — only when the timetable is actually dirty;
    // a pure metadata save should never block on timetable validation.
    if (timetableDirty) {
      const validation = validateTimetable(days, dayEntries)
      setValidationErrors(validation.entryErrors)
      setGlobalValidationErrors(validation.globalErrors)
      const hasHardErrors = Object.values(validation.entryErrors).some((errs) =>
        errs.some((err) => err.fields.length > 0)
      ) || validation.globalErrors.length > 0
      if (hasHardErrors) {
        setTimetableError('Fix the highlighted errors before saving.')
        setUnifiedError('Fix the highlighted timetable errors before saving.')
        document.getElementById('timetable-section')?.scrollIntoView({ behavior: 'smooth' })
        return
      }
    }
    setTimetableError(null)

    // Compute cards across both domains
    const metaCards = computeMetaCards(savedMeta, currentMeta, rejectedMetaFields)
    const tableCards = computeTimetableCards(
      savedDayEntries, dayEntries, deletedEntryIds,
      rejectedAddedLocalIds, rejectedEditedIds, days,
    )
    const emailsChanged = notificationEmails !== savedNotificationEmails

    // No reviewable cards — direct commit (covers notification_emails-only edits).
    if (metaCards.length === 0 && tableCards.length === 0) {
      if (!emailsChanged) {
        // Nothing to save — treat as a no-op success.
        setUnifiedSuccess(true)
        setTimeout(() => setUnifiedSuccess(false), 3000)
        return
      }
      setReviewMode('unified')
      setReviewSaving(true)
      try {
        await runUnifiedSave(rejectedMetaFields, rejectedAddedLocalIds, rejectedEditedIds, false)
      } finally {
        setReviewSaving(false)
        setReviewMode(null)
      }
      return
    }

    setReviewMode('unified')
    setReviewOpen(true)
  }

  // ---------------------------------------------------------------------------
  // Accept / Reject handlers (called from ReviewModal)
  // ---------------------------------------------------------------------------

  function handleAcceptCard(cardId: string) {
    const card = reviewCards.find((c) => c.id === cardId)
    if (!card) return
    // Branch by card.kind so the handler works for metadata, timetable, and
    // unified (mixed) review modes.
    if (card.kind === 'meta-field') {
      setRejectedMetaFields((prev) => { const s = new Set(prev); s.delete(cardId); return s })
    } else if (card.kind === 'entry-added') {
      setRejectedAddedLocalIds((prev) => { const s = new Set(prev); s.delete(cardId); return s })
    } else if (card.kind === 'entry-edited') {
      setRejectedEditedIds((prev) => { const s = new Set(prev); s.delete(cardId); return s })
    }
    // entry-removed / entry-reordered cannot be un-rejected (immediate revert)
  }

  function handleRejectCard(cardId: string) {
    const card = reviewCards.find((c) => c.id === cardId)
    if (!card) return
    if (card.kind === 'meta-field') {
      setRejectedMetaFields((prev) => new Set(Array.from(prev).concat(cardId)))
    } else if (card.kind === 'entry-added') {
      setRejectedAddedLocalIds((prev) => new Set(Array.from(prev).concat(cardId)))
    } else if (card.kind === 'entry-edited') {
      setRejectedEditedIds((prev) => new Set(Array.from(prev).concat(cardId)))
    } else if (card.kind === 'entry-removed') {
      // Immediate effect: restore the deleted entry
      handleRestoreDeletedEntry(cardId)
    } else if (card.kind === 'entry-reordered') {
      // Immediate effect: revert sort order to saved
      handleRevertReorder()
    }
  }

  // ---------------------------------------------------------------------------
  // Restore a deleted entry (rejection of entry-removed card)
  // ---------------------------------------------------------------------------

  function handleRestoreDeletedEntry(entryId: string) {
    setDeletedEntryIds((prev) => prev.filter((id) => id !== entryId))
    for (const [dayId, entries] of Object.entries(savedDayEntries)) {
      const entry = entries.find((e) => e.id === entryId)
      if (!entry) continue
      const restored: EntryDraft = { ...entry, _localId: crypto.randomUUID() }
      setDayEntries((prev) => ({
        ...prev,
        [dayId]: [...(prev[dayId] ?? []), restored].sort((a, b) => a.sort_order - b.sort_order),
      }))
      break
    }
  }

  // ---------------------------------------------------------------------------
  // Revert reorder (rejection of entry-reordered card)
  // ---------------------------------------------------------------------------

  function handleRevertReorder() {
    setDayEntries((prev) => {
      const next: Record<string, EntryDraft[]> = {}
      for (const [dayId, entries] of Object.entries(prev)) {
        const savedForDay = savedDayEntries[dayId] ?? []
        const savedOrderById: Record<string, number> = {}
        for (const e of savedForDay) { if (e.id) savedOrderById[e.id] = e.sort_order }
        next[dayId] = entries
          .map((e) => e.id && savedOrderById[e.id] !== undefined
            ? { ...e, sort_order: savedOrderById[e.id] }
            : e)
          .sort((a, b) => a.sort_order - b.sort_order)
      }
      return next
    })
  }

  // ---------------------------------------------------------------------------
  // Actual save — metadata
  // ---------------------------------------------------------------------------

  async function performMetaSave(rejectedFields: Set<string>) {
    const payload = {
      title:      rejectedFields.has('title')      ? savedMeta.title      : title.trim(),
      venue:      rejectedFields.has('venue')      ? savedMeta.venue      : venue,
      start_date: rejectedFields.has('start_date') ? savedMeta.start_date : startDate,
      end_date:   rejectedFields.has('end_date')   ? savedMeta.end_date   : endDate,
      timezone:   rejectedFields.has('timezone')   ? savedMeta.timezone   : timezone,
      notes:      rejectedFields.has('notes')      ? savedMeta.notes      : notes,
    }

    // notification_emails is not tracked in the review/reject flow — always
    // use the current input value; check separately for changes.
    const emailsChanged = notificationEmails !== savedNotificationEmails
    const hasChanges =
      META_FIELDS.some((k) => (payload[k] || null) !== (savedMeta[k] || null)) || emailsChanged

    if (!hasChanges) {
      setMetaSuccess(true)
      setTimeout(() => setMetaSuccess(false), 3000)
      return true
    }

    const result = await updateEventMetadata(event.id, {
      ...payload,
      notification_emails: notificationEmails,
    })
    if (!result.success) { setMetaError(result.error); return false }

    // Update savedMeta with the accepted values.
    // Rejected fields retain their old savedMeta value, so they keep showing
    // as 'rejected' in the editor. Do NOT clear rejectedMetaFields here.
    setSavedMeta(payload)
    setSavedNotificationEmails(notificationEmails)
    setMetaSuccess(true)
    setTimeout(() => setMetaSuccess(false), 3000)
    setAuditRefreshSignal((n) => n + 1)
    // Refresh server data so audit log updates without a manual reload
    startTransition(() => router.refresh())
    return true
  }

  // ---------------------------------------------------------------------------
  // Actual save — timetable
  // ---------------------------------------------------------------------------

  async function performTimetableSave(
    rejAddedLocalIds: Set<string>,
    rejEditedIds: Set<string>,
    notify: boolean
  ) {
    debugLog('EventEditor', 'FINAL SAVE notify:', notify)
    const allEntries: EntryInput[] = []
    for (const day of days) {
      for (const e of dayEntries[day.id] ?? []) {
        // Skip rejected added entries
        if (e.id === null && rejAddedLocalIds.has(e._localId)) continue

        // For rejected edits: send saved values (keeping current sort_order)
        if (e.id && rejEditedIds.has(e.id)) {
          const saved = savedEntriesById[e.id]
          if (saved) {
            allEntries.push({
              id: e.id, event_day_id: e.event_day_id,
              title: saved.title,
              start_time: saved.start_time,
              end_time: (saved.end_time || null) as string | null,
              category: (saved.category || null) as string | null,
              notes: (saved.notes || null) as string | null,
              sort_order: e.sort_order,
              is_break: saved.is_break,
            })
            continue
          }
        }

        allEntries.push({
          id: e.id, event_day_id: e.event_day_id,
          title: e.title.trim(),
          start_time: e.start_time,
          end_time: e.end_time || null,
          category: e.category.trim() || null,
          notes: e.notes.trim() || null,
          sort_order: e.sort_order,
          is_break: e.is_break,
        })
      }
    }

    debugLog('EventEditor', 'CALL saveDayEntries notify:', notify)
    const result = await saveDayEntries(event.id, allEntries, deletedEntryIds, notify)
    if (!result.success) {
      const friendly = /cannot affect row a second time|duplicate key/i.test(result.error)
        ? 'Could not save the timetable — the editor is out of sync with the server. Please refresh the page and try again.'
        : result.error
      setTimetableError(friendly)
      return false
    }

    // Assign server-generated IDs only to accepted new entries.
    // savedIds is positionally aligned with allEntries (the full payload), so we
    // must advance slotIdx for every entry that made it into the payload.
    // Only rejected-added entries were skipped in the payload build (line 738),
    // so they are the only ones that do NOT consume a slot here.
    const savedIds = result.data.savedIds
    let slotIdx = 0
    const updated: Record<string, EntryDraft[]> = {}
    for (const day of days) {
      updated[day.id] = (dayEntries[day.id] ?? []).map((e) => {
        // Rejected added entries were skipped in the payload — no slot.
        if (e.id === null && rejAddedLocalIds.has(e._localId)) return e
        // Every other entry consumed one slot in the same order as the payload build.
        const serverId = savedIds[slotIdx++]
        if (e.id !== null) return e                          // existing — keep our id
        return serverId ? { ...e, id: serverId } : e         // accepted new — assign server id
      })
    }

    // Build the new saved baseline to reflect only what the server actually stored:
    // - accepted new entries: include with their server-assigned id
    // - rejected new entries: exclude (server never saw them)
    // - accepted edits: include with current values
    // - rejected edits: include with OLD saved values (server still has those)
    // - deleted entries: exclude (already removed server-side)
    const newSavedDayEntries: Record<string, EntryDraft[]> = {}
    for (const day of days) {
      newSavedDayEntries[day.id] = (updated[day.id] ?? []).flatMap((e) => {
        if (e.id === null) return []                         // rejected new — not saved
        if (rejEditedIds.has(e.id)) {
          const old = savedEntriesById[e.id]                 // rejected edit — keep old saved values
          return old ? [old] : []
        }
        return [e]                                           // accepted (new or edit)
      })
    }

    setDayEntries(updated)
    setSavedDayEntries(newSavedDayEntries)
    setDeletedEntryIds([])
    // Do NOT clear rejection sets — rejected changes must remain visible and
    // highlighted in the editor until the user accepts or reverts them.
    setTimetableSuccess(true)
    setTimeout(() => setTimetableSuccess(false), 3000)
    setAuditRefreshSignal((n) => n + 1)
    // Only the timetable save path can trigger a notification_log write (via the
    // Save-and-notify footer action). Metadata save does not — DEC-002 — so the
    // metadata refresh site intentionally does not bump this signal.
    setNotificationRefreshSignal((n) => n + 1)
    // Refresh server data so audit log updates without a manual reload
    startTransition(() => router.refresh())
    return true
  }

  // ---------------------------------------------------------------------------
  // Review modal callbacks
  // ---------------------------------------------------------------------------

  async function handleAcceptAll(notify: boolean) {
    setReviewSaving(true)
    setReviewOpen(false)
    if (reviewMode === 'metadata') {
      await performMetaSave(new Set())  // empty rejections = save everything
    } else if (reviewMode === 'timetable') {
      await performTimetableSave(new Set(), new Set(), notify)
    } else if (reviewMode === 'unified') {
      await runUnifiedSave(new Set(), new Set(), new Set(), notify)
    }
    setReviewSaving(false)
    setReviewMode(null)
  }

  async function handleConfirmSave(notify: boolean) {
    setReviewSaving(true)
    setReviewOpen(false)
    if (reviewMode === 'metadata') {
      await performMetaSave(rejectedMetaFields)
    } else if (reviewMode === 'timetable') {
      await performTimetableSave(rejectedAddedLocalIds, rejectedEditedIds, notify)
    } else if (reviewMode === 'unified') {
      await runUnifiedSave(rejectedMetaFields, rejectedAddedLocalIds, rejectedEditedIds, notify)
    }
    setReviewSaving(false)
    setReviewMode(null)
  }

  /**
   * Called when the user accepts the final/only card while it was previously
   * rejected (i.e. "Undo skip & save"). We must remove the card from the
   * rejection set AND save in the same synchronous step — we cannot wait for
   * React to flush the state update before reading it inside performXxxSave.
   */
  async function handleAcceptAndSave(cardId: string, notify: boolean) {
    const card = reviewCards.find((c) => c.id === cardId)
    setReviewSaving(true)
    setReviewOpen(false)

    // Compute new rejection sets based on the card's domain — works for
    // metadata, timetable, and unified modes.
    let newRejMeta = rejectedMetaFields
    let newRejAdded  = rejectedAddedLocalIds
    let newRejEdited = rejectedEditedIds
    if (card?.kind === 'meta-field') {
      newRejMeta = new Set(Array.from(rejectedMetaFields).filter((id) => id !== cardId))
      setRejectedMetaFields(newRejMeta)
    } else if (card?.kind === 'entry-added') {
      newRejAdded = new Set(Array.from(rejectedAddedLocalIds).filter((id) => id !== cardId))
      setRejectedAddedLocalIds(newRejAdded)
    } else if (card?.kind === 'entry-edited') {
      newRejEdited = new Set(Array.from(rejectedEditedIds).filter((id) => id !== cardId))
      setRejectedEditedIds(newRejEdited)
    }

    if (reviewMode === 'metadata') {
      await performMetaSave(newRejMeta)
    } else if (reviewMode === 'timetable') {
      await performTimetableSave(newRejAdded, newRejEdited, notify)
    } else if (reviewMode === 'unified') {
      await runUnifiedSave(newRejMeta, newRejAdded, newRejEdited, notify)
    }

    setReviewSaving(false)
    setReviewMode(null)
  }

  function handleCancelReview() {
    setReviewOpen(false)
    // Keep reviewMode set — reviewCards remain reactive to changes
  }

  // ---------------------------------------------------------------------------
  // Entry revert handlers
  // ---------------------------------------------------------------------------

  function handleRevertEntry(dayId: string, localId: string) {
    const entry = (dayEntries[dayId] ?? []).find((e) => e._localId === localId)
    if (!entry?.id) return  // added entries have nothing to revert to
    const saved = savedEntriesById[entry.id]
    if (!saved) return
    setDayEntries((prev) => ({
      ...prev,
      [dayId]: (prev[dayId] ?? []).map((e) =>
        e._localId === localId
          ? { ...saved, _localId: e._localId, sort_order: e.sort_order }
          : e
      ),
    }))
    setRejectedEditedIds((prev) => { const s = new Set(prev); s.delete(entry.id as string); return s })
  }

  function handleRevertEntryField(dayId: string, localId: string, field: string) {
    const entry = (dayEntries[dayId] ?? []).find((e) => e._localId === localId)
    if (!entry?.id) return
    const saved = savedEntriesById[entry.id]
    if (!saved) return
    const savedVal = saved[field as keyof EntryDraft]
    setDayEntries((prev) => ({
      ...prev,
      [dayId]: (prev[dayId] ?? []).map((e) =>
        e._localId === localId ? { ...e, [field]: savedVal } : e
      ),
    }))
  }

  async function handleCopyPublicUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 2000)
    } catch {
      // Clipboard unavailable — silently ignore
    }
  }

  // ---------------------------------------------------------------------------
  // Entry change handlers
  // ---------------------------------------------------------------------------

  function handleEntriesChange(dayId: string, entries: EntryDraft[]) {
    setDayEntries((prev) => ({ ...prev, [dayId]: entries }))
    setValidationErrors((prev) => { const next = { ...prev }; delete next[dayId]; return next })
    setTimetableSuccess(false)
  }

  function handleDeleteEntry(dayId: string, localId: string) {
    const entry = (dayEntries[dayId] ?? []).find((e) => e._localId === localId)
    if (entry?.id) setDeletedEntryIds((prev) => [...prev, entry.id as string])
    // Clear rejection if this was a rejected-add
    if (!entry?.id) setRejectedAddedLocalIds((prev) => { const s = new Set(prev); s.delete(localId); return s })
    setDayEntries((prev) => ({
      ...prev,
      [dayId]: (prev[dayId] ?? []).filter((e) => e._localId !== localId),
    }))
  }

  // ---------------------------------------------------------------------------
  // Day clipboard handlers
  // ---------------------------------------------------------------------------

  function handleCopyDay(dayId: string) {
    const entries = dayEntries[dayId] ?? []
    const day = days.find((d) => d.id === dayId)
    setClipboard({
      sourceEventId: event.id,
      sourceDayId: dayId,
      sourceDayLabel: day?.label ?? day?.date ?? null,
      entries: entries.map(({ title, start_time, end_time, category, notes, is_break }) => ({
        title, start_time, end_time, category, notes, is_break,
      })),
      copiedAt: Date.now(),
    })
  }

  function handlePasteDay(targetDayId: string, mode: 'append' | 'replace') {
    if (!clipboard) return
    const existing = mode === 'append' ? (dayEntries[targetDayId] ?? []) : []
    const startSort = existing.length

    if (mode === 'replace') {
      const deletedIds = (dayEntries[targetDayId] ?? [])
        .map((e) => e.id)
        .filter((id): id is string => id !== null)
      if (deletedIds.length > 0) {
        setDeletedEntryIds((prev) => [...prev, ...deletedIds])
      }
    }

    const pasted: EntryDraft[] = clipboard.entries.map((e, i) => ({
      _localId: crypto.randomUUID(),
      id: null,
      event_day_id: targetDayId,
      title: e.title,
      start_time: e.start_time,
      end_time: e.end_time,
      category: e.category,
      notes: e.notes,
      is_break: e.is_break,
      sort_order: startSort + i,
    }))

    setDayEntries((prev) => ({
      ...prev,
      [targetDayId]: [...existing, ...pasted],
    }))
    // Clear validation errors for the target day so pasted rows aren't pre-flagged
    setValidationErrors((prev) => { const next = { ...prev }; delete next[targetDayId]; return next })
    setTimetableSuccess(false)
  }

  // ---------------------------------------------------------------------------
  // Dialog descriptions
  // ---------------------------------------------------------------------------

  const dialogConfig: Record<DialogKind, { title: string; description: string; label: string; destructive?: boolean }> = {
    publish:   { title: 'Publish this event?',    description: 'It will become publicly visible immediately.', label: 'Publish' },
    unpublish: { title: 'Unpublish this event?',  description: 'Public access will be removed. You can republish at any time.', label: 'Unpublish', destructive: true },
    archive:   { title: 'Archive this event?',    description: 'The event will be hidden from your dashboard.', label: 'Archive', destructive: true },
    duplicate: { title: 'Duplicate this event',   description: 'Creates a full copy of the event and all its timetable entries in draft status.', label: 'Duplicate' },
    saveTemplate: { title: 'Save as Template', description: 'Save the current timetable structure as a reusable template.', label: 'Save Template' },
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">

      {/* ── Section anchor nav (desktop only) ──────────────────────────────── */}
      <nav aria-label="Editor sections" className="hidden sm:flex items-center gap-4 text-xs text-gray-500">
        <span className="text-gray-400">Jump to:</span>
        <a href="#event-details"      className="hover:text-gray-900 transition-colors">Details</a>
        <a href="#timetable-section"  className="hover:text-gray-900 transition-colors">Timetable</a>
        <a href="#event-history"      className="hover:text-gray-900 transition-colors">History</a>
        <a href="#event-audit"        className="hover:text-gray-900 transition-colors">Audit</a>
        <a href="#event-notifications" className="hover:text-gray-900 transition-colors">Notifications</a>
      </nav>

      {/* ── Lifecycle actions ───────────────────────────────────────────────── */}
      {/* MGT-096: EventActionsBar now owns the single unified "Save changes"
          CTA. `onSave={handleUnifiedSave}` is the only save entry point for
          metadata + timetable combined. */}
      <EventActionsBar
        status={status}
        publicHref={event.slug ? publicUrl : null}
        isDirty={isDirty}
        onSave={() => { void handleUnifiedSave() }}
        saving={reviewSaving}
        saveSuccess={unifiedSuccess}
        saveError={unifiedError}
        onPublish={() => { setDialog('publish'); setDialogError(null); setPublishAck(false); setNotifyOnPublish(false) }}
        onUnpublish={() => { setDialog('unpublish'); setDialogError(null) }}
        onArchive={() => { setDialog('archive'); setDialogError(null) }}
        onDuplicate={() => {
          setDialog('duplicate'); setDialogError(null)
          setDupTitle(title + ' (copy)'); setDupStartDate(startDate); setDupEndDate(endDate)
        }}
        onSaveTemplate={() => {
          setDialog('saveTemplate'); setDialogError(null)
          setTemplateName(title + ' Template'); setTemplateSuccess(false)
        }}
      />

      {/* ── Event metadata ──────────────────────────────────────────────────── */}
      <section id="event-details" className={`${CARD} overflow-hidden`}>
        <div className="px-6 py-3 border-b border-gray-100">
          <h2 className={H2}>Event details</h2>
        </div>

        <form onSubmit={handleUnifiedSave} className={`${CARD_PADDING} grid grid-cols-1 md:grid-cols-12 gap-3`}>
          {/* Title */}
          <div className="md:col-span-7">
            <MetaFieldLabel label="Title *" field="title" current={title} max={FIELD_LIMITS.event.title} />
            <input type="text" value={title} onChange={(e) => { setTitle(e.target.value); setRejectedMetaFields((p) => { const s = new Set(p); s.delete('title'); return s }) }}
              required maxLength={FIELD_LIMITS.event.title} className={metaInputClass('title', title)} />
          </div>

          {/* Venue */}
          <div className="md:col-span-5">
            <MetaFieldLabel label="Venue" field="venue" current={venue} max={FIELD_LIMITS.event.venue} />
            <input type="text" value={venue} onChange={(e) => { setVenue(e.target.value); setRejectedMetaFields((p) => { const s = new Set(p); s.delete('venue'); return s }) }}
              placeholder="e.g. Whilton Mill Karting" maxLength={FIELD_LIMITS.event.venue} className={metaInputClass('venue', venue)} />
          </div>

          {/* Dates + timezone */}
          <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <MetaFieldLabel label="Start date *" field="start_date" current={startDate} />
              <input type="date" value={startDate} required
                onChange={(e) => { setStartDate(e.target.value); setRejectedMetaFields((p) => { const s = new Set(p); s.delete('start_date'); return s }) }}
                className={metaInputClass('start_date', startDate)} />
            </div>
            <div>
              <MetaFieldLabel label="End date *" field="end_date" current={endDate} />
              <input type="date" value={endDate} required
                onChange={(e) => { setEndDate(e.target.value); setRejectedMetaFields((p) => { const s = new Set(p); s.delete('end_date'); return s }) }}
                className={metaInputClass('end_date', endDate)} />
            </div>
            <div>
              <MetaFieldLabel label="Timezone" field="timezone" current={timezone} />
              <select value={timezone}
                onChange={(e) => { setTimezone(e.target.value); setRejectedMetaFields((p) => { const s = new Set(p); s.delete('timezone'); return s }) }}
                className={metaInputClass('timezone', timezone) + ' bg-white'}>
                <option value="Europe/London">Europe/London (UK)</option>
                <option value="Europe/Paris">Europe/Paris (CET)</option>
                <option value="America/New_York">America/New_York (ET)</option>
                <option value="America/Chicago">America/Chicago (CT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="md:col-span-12">
            <MetaFieldLabel label="Notes" field="notes" current={notes} max={FIELD_LIMITS.event.notes} />
            <textarea value={notes} rows={1} placeholder="Organiser notes…"
              maxLength={FIELD_LIMITS.event.notes}
              onChange={(e) => { setNotes(e.target.value); setRejectedMetaFields((p) => { const s = new Set(p); s.delete('notes'); return s }) }}
              className={metaInputClass('notes', notes) + ' resize-y'} />
            <p className={HELP_TEXT}>Internal — not shown publicly</p>
          </div>

          {/* Notification emails */}
          <div className="md:col-span-12">
            <div className="flex items-center justify-between">
              <label className={LABEL_COMPACT}>
                Notification emails
              </label>
              <CharCounter used={notificationEmails.length} max={FIELD_LIMITS.event.notificationEmails} />
            </div>
            <input
              type="text"
              value={notificationEmails}
              onChange={(e) => setNotificationEmails(e.target.value)}
              placeholder="e.g. alice@example.com, bob@example.com"
              maxLength={FIELD_LIMITS.event.notificationEmails}
              className={INPUT}
            />
            <p className={HELP_TEXT}>
              Notified when this event is published or the timetable changes. Separate multiple addresses with commas.
            </p>
            {unsubscribedEmails.length > 0 && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <p className="font-medium">
                  {unsubscribedEmails.length} recipient{unsubscribedEmails.length === 1 ? '' : 's'} unsubscribed
                </p>
                <ul className="mt-1 list-disc list-inside text-amber-700">
                  {unsubscribedEmails.map((email) => (
                    <li key={email}>{email}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Public URL — read-only, shown whenever slug exists */}
          {event.slug && (
            <div className="md:col-span-12 flex flex-col gap-0.5">
              <div className="flex items-center gap-2 max-w-xl">
                <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">Public URL</span>
                <input
                  type="text"
                  readOnly
                  value={publicUrl}
                  className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded bg-gray-50 text-gray-400 font-mono focus:outline-none truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyPublicUrl}
                  className="shrink-0 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2.5 py-1 hover:border-gray-300 transition-colors whitespace-nowrap"
                >
                  {urlCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              {status !== 'published' && (
                <p className={HELP_TEXT}>Not published — 404 until published.</p>
              )}
            </div>
          )}

          {/* MGT-096: per-section Save removed — single "Save changes" CTA lives
              in EventActionsBar. Inline metaError still surfaces during
              unified-save validation so the message appears near the form. */}
          {metaError && (
            <div className="md:col-span-12">
              <p className="text-sm text-red-600" role="alert">{metaError}</p>
            </div>
          )}
        </form>
      </section>

      {/* ── Timetable builder ────────────────────────────────────────────────── */}
      <section id="timetable-section" className={`${CARD} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className={H2}>Timetable</h2>
          <p className={HELP_TEXT}>
            Add entries for each day. Drag rows to reorder. Save when done.
          </p>
        </div>

        {globalValidationErrors.length > 0 && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            {globalValidationErrors.map((e, i) => <p key={i} className="text-sm text-red-700">{e}</p>)}
          </div>
        )}

        <div className={CARD_PADDING}>
          <TimetableBuilder
            eventId={event.id}
            days={days}
            dayEntries={dayEntries}
            validationErrors={validationErrors}
            entryChangeInfos={entryChangeInfos}
            onDaysChange={setDays}
            onEntriesChange={handleEntriesChange}
            onDeleteEntry={handleDeleteEntry}
            onRevertEntry={handleRevertEntry}
            onRevertEntryField={handleRevertEntryField}
            clipboard={clipboard}
            onCopyDay={handleCopyDay}
            onPasteDay={handlePasteDay}
          />
          {/* Timetable-specific error surfaces below the builder (the same
              message is also mirrored in the unified status slot). */}
          {timetableError && (
            <p className="mt-3 text-sm text-red-600" role="alert">{timetableError}</p>
          )}
        </div>
      </section>

      {/* ── Version history ──────────────────────────────────────────────────── */}
      <div id="event-history">
        {versionsLoadError && (
          <div className={ERROR_BANNER} role="alert">{versionsLoadError}</div>
        )}
        <VersionHistory versions={versions} />
      </div>

      {/* ── Audit log ─────────────────────────────────────────────────────────── */}
      <div id="event-audit">
        <AuditLogView entries={auditLog} eventId={event.id} initialHasMore={auditHasMore} initialLoadError={auditLoadError} refreshSignal={auditRefreshSignal} />
      </div>

      {/* ── Notification history ──────────────────────────────────────────────── */}
      <div id="event-notifications">
        <NotificationLogView
          entries={notificationLog}
          eventId={event.id}
          initialHasMore={notificationHasMore}
          initialLoadError={notificationLoadError}
          refreshSignal={notificationRefreshSignal}
        />
      </div>

      {/* ── Review modal ──────────────────────────────────────────────────────── */}
      {/* MGT-096: `unified` mode lists metadata + timetable cards in one pass.
          The notify checkbox appears when the review contains at least one
          timetable card (meta-only unified reviews suppress notify per DEC-002). */}
      <ReviewModal
        open={reviewOpen}
        title={
          reviewMode === 'metadata' ? 'Review details changes'
          : reviewMode === 'timetable' ? 'Review timetable changes'
          : 'Review changes'
        }
        cards={reviewCards}
        saving={reviewSaving}
        onAccept={handleAcceptCard}
        onReject={handleRejectCard}
        onAcceptAll={handleAcceptAll}
        onConfirmSave={handleConfirmSave}
        onAcceptAndSave={handleAcceptAndSave}
        onCancel={handleCancelReview}
        notifyChoiceApplicable={
          status === 'published'
          && !!notificationEmails.trim()
          && (
            reviewMode === 'timetable'
            || (reviewMode === 'unified' && reviewCards.some((c) => c.kind !== 'meta-field'))
          )
        }
        footerExtra={
          status === 'published'
          && !notificationEmails.trim()
          && (
            reviewMode === 'timetable'
            || (reviewMode === 'unified' && reviewCards.some((c) => c.kind !== 'meta-field'))
          )
            ? <p className="text-sm text-gray-400">No notification email addresses set for this event.</p>
            : undefined
        }
      />

      {/* ── Status dialogs ────────────────────────────────────────────────────── */}

      {/* Publish — gated by explicit acknowledgement that the event becomes public */}
      <ConfirmDialog
        open={dialog === 'publish'}
        title={dialogConfig.publish.title}
        description={dialogConfig.publish.description}
        confirmLabel={dialogPending ? 'Working…' : dialogConfig.publish.label}
        confirmDisabled={!publishAck || dialogPending}
        onConfirm={() => handleStatusAction('publish')}
        onCancel={() => { setDialog(null); setPublishAck(false) }}
      >
        {event.slug && (
          <div>
            <label className={LABEL_COMPACT}>Public URL</label>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1.5 break-all">
                {publicUrl}
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(publicUrl)
                    setPublishUrlCopied(true)
                    setTimeout(() => setPublishUrlCopied(false), 2000)
                  } catch {
                    // Clipboard unavailable — silently ignore
                  }
                }}
                className="shrink-0 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1.5 hover:border-gray-300 transition-colors whitespace-nowrap"
              >
                {publishUrlCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={publishAck}
            onChange={(e) => setPublishAck(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
          />
          <span>I understand this event will be publicly accessible.</span>
        </label>
        {notificationEmails.trim() ? (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notifyOnPublish}
              onChange={(e) => setNotifyOnPublish(e.target.checked)}
              className="rounded border-gray-300 text-gray-900 focus:ring-gray-500"
            />
            Notify attendees about this publish
          </label>
        ) : (
          <p className="text-sm text-gray-400">No notification email addresses set for this event.</p>
        )}
        {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}
      </ConfirmDialog>

      {(['unpublish', 'archive'] as const).map((kind) => (
        <ConfirmDialog
          key={kind}
          open={dialog === kind}
          title={dialogConfig[kind].title}
          description={dialogConfig[kind].description}
          confirmLabel={dialogPending ? 'Working…' : dialogConfig[kind].label}
          confirmDestructive={dialogConfig[kind].destructive}
          onConfirm={() => handleStatusAction(kind)}
          onCancel={() => setDialog(null)}
        >
          {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}
        </ConfirmDialog>
      ))}

      <ConfirmDialog
        open={dialog === 'duplicate'}
        title={dialogConfig.duplicate.title}
        description={dialogConfig.duplicate.description}
        confirmLabel={dialogPending ? 'Duplicating…' : 'Duplicate'}
        onConfirm={() => handleStatusAction('duplicate')}
        onCancel={() => setDialog(null)}
      >
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">New title *</label>
              <CharCounter used={dupTitle.length} max={FIELD_LIMITS.event.title} />
            </div>
            <input type="text" value={dupTitle} onChange={(e) => setDupTitle(e.target.value)}
              maxLength={FIELD_LIMITS.event.title}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start date *</label>
              <input type="date" value={dupStartDate} onChange={(e) => setDupStartDate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End date *</label>
              <input type="date" value={dupEndDate} onChange={(e) => setDupEndDate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400" />
            </div>
          </div>
          {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'saveTemplate'}
        title="Save as Template"
        description="Save the current timetable structure as a reusable template."
        confirmLabel={dialogPending ? 'Saving…' : 'Save Template'}
        onConfirm={async () => {
          if (!templateName.trim()) { setDialogError('Template name is required.'); return }
          setDialogPending(true)
          setDialogError(null)
          const result = await saveAsTemplate(event.id, templateName)
          setDialogPending(false)
          if (result.success) {
            setDialog(null)
            setTemplateSuccess(true)
            setTimeout(() => setTemplateSuccess(false), 3000)
          } else {
            setDialogError(result.error)
          }
        }}
        onCancel={() => setDialog(null)}
      >
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">Template name *</label>
              <CharCounter used={templateName.length} max={FIELD_LIMITS.event.templateName} />
            </div>
            <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)}
              maxLength={FIELD_LIMITS.event.templateName}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400" />
          </div>
          {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}
        </div>
      </ConfirmDialog>

      {templateSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          Template saved successfully.
        </div>
      )}

    </div>
  )
}
