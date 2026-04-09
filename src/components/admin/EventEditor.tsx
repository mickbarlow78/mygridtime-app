'use client'

import { useMemo, useState, useTransition } from 'react'
import { debugLog } from '@/lib/debug'
import { useRouter } from 'next/navigation'
import { TimetableBuilder } from './TimetableBuilder'
import { AuditLogView } from './AuditLogView'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ReviewModal, type ReviewCard, type ChangeCard } from '@/components/ui/ReviewModal'
import { cn, CARD, CARD_PADDING, H2, HELP_TEXT, INPUT, LABEL_COMPACT, BTN_PRIMARY, BTN_PRIMARY_SM, BTN_SECONDARY_SM } from '@/lib/styles'
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
import type { VersionSummary } from '@/app/admin/events/actions'
import { VersionHistory } from './VersionHistory'
import { saveAsTemplate } from '@/app/admin/templates/actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuditEntry = AuditLog & { user_email?: string | null }

interface EventEditorProps {
  event: Event
  days: EventDay[]
  entries: TimetableEntry[]
  auditLog: AuditEntry[]
  versions: VersionSummary[]
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

    const titles: string[] = []
    for (const entry of entries) {
      const fields: string[] = []
      const messages: string[] = []
      if (!entry.title.trim())          { fields.push('title');      messages.push('Title is required.') }
      if (!entry.start_time)            { fields.push('start_time'); messages.push('Start time is required.') }
      if (entry.end_time && entry.start_time && entry.end_time <= entry.start_time)
        { fields.push('end_time'); messages.push('End time must be after start time.') }
      if (fields.length > 0) dayErrs.push({ _localId: entry._localId, fields, messages })
      if (entry.title.trim() && titles.includes(entry.title.trim().toLowerCase()))
        dayErrs.push({ _localId: entry._localId, fields: [], messages: [`Duplicate title "${entry.title.trim()}" on this day.`] })
      if (entry.title.trim()) titles.push(entry.title.trim().toLowerCase())
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

export function EventEditor({ event, days: initialDays, entries: initialEntries, auditLog, versions }: EventEditorProps) {
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
  const [reviewOpen,   setReviewOpen]   = useState(false)
  const [reviewMode,   setReviewMode]   = useState<'metadata' | 'timetable' | null>(null)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [notifyOnSave, setNotifyOnSave] = useState(false)

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

  // ── Public URL (read-only, derived from event slug) ──────────────────────
  const publicUrl = (() => {
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    return base ? `${base}/${event.slug}` : `/${event.slug}`
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
    return computeTimetableCards(
      savedDayEntries, dayEntries, deletedEntryIds,
      rejectedAddedLocalIds, rejectedEditedIds, days
    )
  }, [reviewMode, savedMeta, currentMeta, rejectedMetaFields,
      savedDayEntries, dayEntries, deletedEntryIds, rejectedAddedLocalIds, rejectedEditedIds, days])

  // ── Derived: entry change infos for live highlighting ───────────────────
  const entryChangeInfos = useMemo(
    () => computeEntryChangeInfos(savedDayEntries, dayEntries, rejectedAddedLocalIds, rejectedEditedIds, days),
    [savedDayEntries, dayEntries, rejectedAddedLocalIds, rejectedEditedIds, days]
  )

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

  // Label row for a meta field: label + optional revert button
  function MetaFieldLabel({ label, field, current }: { label: string; field: string; current: string }) {
    const state = metaFieldState(field, current)
    return (
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-gray-600">{label}</label>
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
    )
  }

  // ---------------------------------------------------------------------------
  // Metadata save → open review
  // ---------------------------------------------------------------------------

  async function handleSaveMetadata(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim())          { setMetaError('Title is required.');                        return }
    if (!startDate || !endDate) { setMetaError('Start and end dates are required.');         return }
    if (endDate < startDate)    { setMetaError('End date must be on or after start date.'); return }

    setMetaError(null)
    setMetaSuccess(false)

    const cards = computeMetaCards(savedMeta, currentMeta, rejectedMetaFields)
    if (cards.length === 0) {
      // No reviewable field changes — save directly (covers notification_emails-only edits)
      await performMetaSave(rejectedMetaFields)
      return
    }

    setReviewMode('metadata')
    setReviewOpen(true)
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
      result = await publishEvent(event.id)
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
  // Timetable save → open review
  // ---------------------------------------------------------------------------

  function handleSaveTimetable() {
    const validation = validateTimetable(days, dayEntries)
    setValidationErrors(validation.entryErrors)
    setGlobalValidationErrors(validation.globalErrors)

    const hasHardErrors = Object.values(validation.entryErrors).some((errs) =>
      errs.some((e) => e.fields.length > 0)
    ) || validation.globalErrors.length > 0
    if (hasHardErrors) { setTimetableError('Fix the highlighted errors before saving.'); return }

    setTimetableError(null)
    setTimetableSuccess(false)

    const cards = computeTimetableCards(
      savedDayEntries, dayEntries, deletedEntryIds,
      rejectedAddedLocalIds, rejectedEditedIds, days
    )
    if (cards.length === 0) {
      setTimetableSuccess(true)
      setTimeout(() => setTimetableSuccess(false), 3000)
      return
    }

    setNotifyOnSave(false)
    setReviewMode('timetable')
    setReviewOpen(true)
  }

  // ---------------------------------------------------------------------------
  // Accept / Reject handlers (called from ReviewModal)
  // ---------------------------------------------------------------------------

  function handleAcceptCard(cardId: string) {
    const card = reviewCards.find((c) => c.id === cardId)
    if (!card) return
    if (reviewMode === 'metadata') {
      setRejectedMetaFields((prev) => { const s = new Set(prev); s.delete(cardId); return s })
    } else {
      if (card.kind === 'entry-added')
        setRejectedAddedLocalIds((prev) => { const s = new Set(prev); s.delete(cardId); return s })
      else if (card.kind === 'entry-edited')
        setRejectedEditedIds((prev) => { const s = new Set(prev); s.delete(cardId); return s })
      // entry-removed / entry-reordered cannot be un-rejected (immediate revert)
    }
  }

  function handleRejectCard(cardId: string) {
    const card = reviewCards.find((c) => c.id === cardId)
    if (!card) return
    if (reviewMode === 'metadata') {
      setRejectedMetaFields((prev) => new Set(Array.from(prev).concat(cardId)))
    } else {
      if (card.kind === 'entry-added') {
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
    // Refresh server data so audit log updates without a manual reload
    startTransition(() => router.refresh())
    return true
  }

  // ---------------------------------------------------------------------------
  // Actual save — timetable
  // ---------------------------------------------------------------------------

  async function performTimetableSave(
    rejAddedLocalIds: Set<string>,
    rejEditedIds: Set<string>
  ) {
    debugLog('EventEditor', 'FINAL SAVE notifyOnSave:', notifyOnSave)
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

    debugLog('EventEditor', 'CALL saveDayEntries notifyOnSave:', notifyOnSave)
    const result = await saveDayEntries(event.id, allEntries, deletedEntryIds, notifyOnSave)
    if (!result.success) { setTimetableError(result.error); return false }

    // Assign server-generated IDs only to accepted new entries.
    // Rejected new entries (id === null, in rejAddedLocalIds) are skipped in the
    // payload so savedIds has no slot for them — do not increment idx for them.
    const savedIds = result.data.savedIds
    let newIdx = 0
    const updated: Record<string, EntryDraft[]> = {}
    for (const day of days) {
      updated[day.id] = (dayEntries[day.id] ?? []).map((e) => {
        if (e.id !== null) return e                          // existing entry
        if (rejAddedLocalIds.has(e._localId)) return e      // rejected new — keep id: null
        const serverId = savedIds[newIdx++]                  // accepted new — assign server id
        return serverId ? { ...e, id: serverId } : e
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
    // Refresh server data so audit log updates without a manual reload
    startTransition(() => router.refresh())
    return true
  }

  // ---------------------------------------------------------------------------
  // Review modal callbacks
  // ---------------------------------------------------------------------------

  async function handleAcceptAll() {
    setReviewSaving(true)
    setReviewOpen(false)
    if (reviewMode === 'metadata') {
      await performMetaSave(new Set())  // empty rejections = save everything
    } else if (reviewMode === 'timetable') {
      await performTimetableSave(new Set(), new Set())
    }
    setReviewSaving(false)
    setReviewMode(null)
  }

  async function handleConfirmSave() {
    setReviewSaving(true)
    setReviewOpen(false)
    if (reviewMode === 'metadata') {
      await performMetaSave(rejectedMetaFields)
    } else if (reviewMode === 'timetable') {
      await performTimetableSave(rejectedAddedLocalIds, rejectedEditedIds)
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
  async function handleAcceptAndSave(cardId: string) {
    const card = reviewCards.find((c) => c.id === cardId)
    setReviewSaving(true)
    setReviewOpen(false)

    if (reviewMode === 'metadata') {
      const newRejected = new Set(Array.from(rejectedMetaFields).filter((id) => id !== cardId))
      setRejectedMetaFields(newRejected)
      await performMetaSave(newRejected)
    } else if (reviewMode === 'timetable') {
      let newRejAdded  = rejectedAddedLocalIds
      let newRejEdited = rejectedEditedIds
      if (card?.kind === 'entry-added') {
        newRejAdded = new Set(Array.from(rejectedAddedLocalIds).filter((id) => id !== cardId))
        setRejectedAddedLocalIds(newRejAdded)
      } else if (card?.kind === 'entry-edited') {
        newRejEdited = new Set(Array.from(rejectedEditedIds).filter((id) => id !== cardId))
        setRejectedEditedIds(newRejEdited)
      }
      await performTimetableSave(newRejAdded, newRejEdited)
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
    <div className="space-y-8">

      {/* ── Event metadata ──────────────────────────────────────────────────── */}
      <section className={`${CARD} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className={H2}>Event details</h2>
            <StatusBadge status={status} />
          </div>
          <div className="flex items-center gap-2">
            {status === 'draft' && (
              <button type="button" onClick={() => { setDialog('publish'); setDialogError(null) }}
                className={`${BTN_PRIMARY_SM} bg-green-600 hover:bg-green-700`}>
                Publish
              </button>
            )}
            {status === 'published' && (
              <button type="button" onClick={() => { setDialog('unpublish'); setDialogError(null) }}
                className={BTN_SECONDARY_SM}>
                Unpublish
              </button>
            )}
            {status !== 'archived' && (
              <button type="button" onClick={() => { setDialog('archive'); setDialogError(null) }}
                className={BTN_SECONDARY_SM}>
                Archive
              </button>
            )}
            <button type="button"
              onClick={() => { setDialog('duplicate'); setDialogError(null); setDupTitle(title + ' (copy)'); setDupStartDate(startDate); setDupEndDate(endDate) }}
              className={BTN_SECONDARY_SM}>
              Duplicate
            </button>
            <button type="button"
              onClick={() => { setDialog('saveTemplate'); setDialogError(null); setTemplateName(title + ' Template'); setTemplateSuccess(false) }}
              className={BTN_SECONDARY_SM}>
              Save as Template
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveMetadata} className={`${CARD_PADDING} space-y-4`}>
          {/* Title */}
          <div>
            <MetaFieldLabel label="Title *" field="title" current={title} />
            <input type="text" value={title} onChange={(e) => { setTitle(e.target.value); setRejectedMetaFields((p) => { const s = new Set(p); s.delete('title'); return s }) }}
              required className={metaInputClass('title', title)} />
          </div>

          {/* Venue */}
          <div>
            <MetaFieldLabel label="Venue" field="venue" current={venue} />
            <input type="text" value={venue} onChange={(e) => { setVenue(e.target.value); setRejectedMetaFields((p) => { const s = new Set(p); s.delete('venue'); return s }) }}
              placeholder="e.g. Whilton Mill Karting" className={metaInputClass('venue', venue)} />
          </div>

          {/* Dates + timezone */}
          <div className="grid grid-cols-3 gap-3">
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
          <div>
            <MetaFieldLabel label="Notes" field="notes" current={notes} />
            <textarea value={notes} rows={2} placeholder="Organiser notes…"
              onChange={(e) => { setNotes(e.target.value); setRejectedMetaFields((p) => { const s = new Set(p); s.delete('notes'); return s }) }}
              className={metaInputClass('notes', notes) + ' resize-none'} />
            <p className={HELP_TEXT}>Internal — not shown publicly</p>
          </div>

          {/* Notification emails */}
          <div>
            <label className={LABEL_COMPACT}>
              Notification emails
            </label>
            <input
              type="text"
              value={notificationEmails}
              onChange={(e) => setNotificationEmails(e.target.value)}
              placeholder="e.g. alice@example.com, bob@example.com"
              className={INPUT}
            />
            <p className={HELP_TEXT}>
              Notified when this event is published or the timetable changes. Separate multiple addresses with commas.
            </p>
          </div>

          {/* Public URL — read-only, shown whenever slug exists */}
          {event.slug && (
            <div>
              <label className={LABEL_COMPACT}>
                Public URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicUrl}
                  className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-600 font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyPublicUrl}
                  className="shrink-0 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2.5 py-2 hover:border-gray-300 transition-colors whitespace-nowrap"
                >
                  {urlCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              {status !== 'published' && (
                <p className={HELP_TEXT}>
                  Not published — this URL will return a 404 until the event is published.
                </p>
              )}
            </div>
          )}

          {/* Save row */}
          <div className="flex items-center gap-4">
            <button type="submit"
              className={BTN_PRIMARY}>
              Save details
            </button>
            {metaSuccess && <p className="text-sm text-green-600">Saved.</p>}
            {metaError   && <p className="text-sm text-red-600">{metaError}</p>}
          </div>
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
            saving={reviewSaving && reviewMode === 'timetable'}
            saveError={timetableError}
            saveSuccess={timetableSuccess}
            entryChangeInfos={entryChangeInfos}
            onDaysChange={setDays}
            onEntriesChange={handleEntriesChange}
            onDeleteEntry={handleDeleteEntry}
            onRevertEntry={handleRevertEntry}
            onRevertEntryField={handleRevertEntryField}
            onSave={handleSaveTimetable}
          />
        </div>
      </section>

      {/* ── Version history ──────────────────────────────────────────────────── */}
      <VersionHistory versions={versions} />

      {/* ── Audit log ─────────────────────────────────────────────────────────── */}
      <AuditLogView entries={auditLog} />

      {/* ── Review modal ──────────────────────────────────────────────────────── */}
      <ReviewModal
        open={reviewOpen}
        title={reviewMode === 'metadata' ? 'Review details changes' : 'Review timetable changes'}
        cards={reviewCards}
        saving={reviewSaving}
        onAccept={handleAcceptCard}
        onReject={handleRejectCard}
        onAcceptAll={handleAcceptAll}
        onConfirmSave={handleConfirmSave}
        onAcceptAndSave={handleAcceptAndSave}
        onCancel={handleCancelReview}
        footerExtra={reviewMode === 'timetable' && status === 'published' ? (
          notificationEmails.trim() ? (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={notifyOnSave}
                onChange={(e) => { debugLog('EventEditor', 'NOTIFY TOGGLED:', e.target.checked); setNotifyOnSave(e.target.checked) }}
                className="rounded border-gray-300 text-gray-900 focus:ring-gray-500"
              />
              Notify attendees about changes
            </label>
          ) : (
            <p className="text-sm text-gray-400">No notification email addresses set for this event.</p>
          )
        ) : undefined}
      />

      {/* ── Status dialogs ────────────────────────────────────────────────────── */}
      {(['publish', 'unpublish', 'archive'] as const).map((kind) => (
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
            <label className="block text-xs font-medium text-gray-600 mb-1">New title *</label>
            <input type="text" value={dupTitle} onChange={(e) => setDupTitle(e.target.value)}
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Template name *</label>
            <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)}
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
