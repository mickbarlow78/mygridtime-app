'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TimetableBuilder } from './TimetableBuilder'
import { AuditLogView } from './AuditLogView'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
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
import type { EntryDraft, EntryValidationError } from './EntryRow'
import type { Event, EventDay, TimetableEntry, AuditLog } from '@/lib/types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuditEntry = AuditLog & { user_email?: string | null }

interface EventEditorProps {
  event: Event
  days: EventDay[]
  entries: TimetableEntry[]
  auditLog: AuditEntry[]
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean
  globalErrors: string[]
  entryErrors: Record<string, EntryValidationError[]>  // keyed by dayId
}

function validateTimetable(
  days: EventDay[],
  dayEntries: Record<string, EntryDraft[]>
): ValidationResult {
  const globalErrors: string[] = []
  const entryErrors: Record<string, EntryValidationError[]> = {}

  if (days.length === 0) {
    globalErrors.push('Event must have at least one day.')
  }

  for (const day of days) {
    const entries = dayEntries[day.id] ?? []
    const dayErrs: EntryValidationError[] = []

    if (entries.length === 0) {
      globalErrors.push(`Day "${day.label ?? day.date}" has no entries. Add at least one or remove the day.`)
    }

    const titles: string[] = []
    for (const entry of entries) {
      const fields: string[] = []
      const messages: string[] = []

      if (!entry.title.trim()) {
        fields.push('title')
        messages.push('Title is required.')
      }
      if (!entry.start_time) {
        fields.push('start_time')
        messages.push('Start time is required.')
      }
      if (entry.end_time && entry.start_time && entry.end_time <= entry.start_time) {
        fields.push('end_time')
        messages.push('End time must be after start time.')
      }

      if (fields.length > 0) {
        dayErrs.push({ _localId: entry._localId, fields, messages })
      }

      // Duplicate title warning (not blocking, just surfaced separately)
      if (entry.title.trim() && titles.includes(entry.title.trim().toLowerCase())) {
        // Push a warning-only error (no blocking fields)
        dayErrs.push({
          _localId: entry._localId,
          fields: [],
          messages: [`Duplicate title "${entry.title.trim()}" on this day.`],
        })
      }
      if (entry.title.trim()) titles.push(entry.title.trim().toLowerCase())
    }

    if (dayErrs.length > 0) entryErrors[day.id] = dayErrs
  }

  const valid = globalErrors.length === 0 &&
    Object.values(entryErrors).every((errs) => errs.every((e) => e.fields.length === 0))

  return { valid, globalErrors, entryErrors }
}

// ---------------------------------------------------------------------------
// Build initial entry state from database rows
// ---------------------------------------------------------------------------

function buildDayEntries(
  days: EventDay[],
  entries: TimetableEntry[]
): Record<string, EntryDraft[]> {
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
// Component
// ---------------------------------------------------------------------------

export function EventEditor({ event, days: initialDays, entries: initialEntries, auditLog }: EventEditorProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // --- Metadata state ---
  const [title, setTitle] = useState(event.title)
  const [venue, setVenue] = useState(event.venue ?? '')
  const [startDate, setStartDate] = useState(event.start_date)
  const [endDate, setEndDate] = useState(event.end_date)
  const [timezone, setTimezone] = useState(event.timezone)
  const [notes, setNotes] = useState(event.notes ?? '')
  const [status, setStatus] = useState(event.status)

  const [metaSaving, setMetaSaving] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [metaSuccess, setMetaSuccess] = useState(false)

  // --- Timetable state ---
  const [days, setDays] = useState<EventDay[]>(initialDays)
  const [dayEntries, setDayEntries] = useState<Record<string, EntryDraft[]>>(
    () => buildDayEntries(initialDays, initialEntries)
  )
  // Track entries deleted from the UI (need server-side delete)
  const [deletedEntryIds, setDeletedEntryIds] = useState<string[]>([])

  const [timetableSaving, setTimetableSaving] = useState(false)
  const [timetableError, setTimetableError] = useState<string | null>(null)
  const [timetableSuccess, setTimetableSuccess] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, EntryValidationError[]>>({})
  const [globalValidationErrors, setGlobalValidationErrors] = useState<string[]>([])

  // --- Dialog state ---
  type DialogKind = 'publish' | 'unpublish' | 'archive' | 'duplicate'
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [dialogPending, setDialogPending] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  // Duplicate form fields
  const [dupTitle, setDupTitle] = useState(event.title + ' (copy)')
  const [dupStartDate, setDupStartDate] = useState(event.start_date)
  const [dupEndDate, setDupEndDate] = useState(event.end_date)

  // ---------------------------------------------------------------------------
  // Metadata save
  // ---------------------------------------------------------------------------

  async function handleSaveMetadata(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setMetaError('Title is required.'); return }
    if (!startDate || !endDate) { setMetaError('Start and end dates are required.'); return }
    if (endDate < startDate) { setMetaError('End date must be on or after start date.'); return }

    setMetaSaving(true)
    setMetaError(null)
    setMetaSuccess(false)

    const result = await updateEventMetadata(event.id, {
      title: title.trim(),
      venue,
      start_date: startDate,
      end_date: endDate,
      timezone,
      notes,
    })

    setMetaSaving(false)
    if (!result.success) { setMetaError(result.error); return }
    setMetaSuccess(true)
    setTimeout(() => setMetaSuccess(false), 3000)
  }

  // ---------------------------------------------------------------------------
  // Status actions
  // ---------------------------------------------------------------------------

  async function handleStatusAction(kind: DialogKind) {
    setDialogPending(true)
    setDialogError(null)

    let result: ActionResult | ActionResult<{ id: string }> | undefined
    if (kind === 'publish') {
      // Run validation first
      const validation = validateTimetable(days, dayEntries)
      if (!validation.valid) {
        setValidationErrors(validation.entryErrors)
        setGlobalValidationErrors(validation.globalErrors)
        setDialog(null)
        setDialogPending(false)
        // Scroll to timetable section
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
        title: dupTitle.trim(),
        start_date: dupStartDate,
        end_date: dupEndDate,
      })
      if (dupResult.success) {
        const newId = dupResult.data.id
        startTransition(() => router.push(`/admin/events/${newId}`))
        setDialog(null)
        return
      }
      result = dupResult
    }

    setDialogPending(false)
    if (!result || !result.success) {
      setDialogError(result?.error ?? 'Something went wrong.')
      return
    }

    // Update local status
    if (kind === 'publish') setStatus('published')
    else if (kind === 'unpublish') setStatus('draft')
    else if (kind === 'archive') setStatus('archived')

    setDialog(null)
  }

  // ---------------------------------------------------------------------------
  // Timetable save
  // ---------------------------------------------------------------------------

  async function handleSaveTimetable() {
    const validation = validateTimetable(days, dayEntries)
    setValidationErrors(validation.entryErrors)
    setGlobalValidationErrors(validation.globalErrors)

    // Allow save even with warnings; block only on hard errors
    const hasHardErrors = Object.values(validation.entryErrors).some((errs) =>
      errs.some((e) => e.fields.length > 0)
    ) || validation.globalErrors.length > 0

    if (hasHardErrors) {
      setTimetableError('Fix the highlighted errors before saving.')
      return
    }

    setTimetableSaving(true)
    setTimetableError(null)
    setTimetableSuccess(false)

    // Collect all entries across all days
    const allEntries: EntryInput[] = []
    for (const day of days) {
      const entries = dayEntries[day.id] ?? []
      entries.forEach((e) => {
        allEntries.push({
          id: e.id,
          event_day_id: e.event_day_id,
          title: e.title.trim(),
          start_time: e.start_time,
          end_time: e.end_time || null,
          category: e.category.trim() || null,
          notes: e.notes.trim() || null,
          sort_order: e.sort_order,
          is_break: e.is_break,
        })
      })
    }

    const result = await saveDayEntries(event.id, allEntries, deletedEntryIds)

    if (!result.success) {
      setTimetableSaving(false)
      setTimetableError(result.error)
      return
    }

    // Update local entry IDs with server-assigned IDs
    const savedIds = result.data.savedIds
    let savedIdx = 0
    const updatedDayEntries: Record<string, EntryDraft[]> = {}
    for (const day of days) {
      const entries = dayEntries[day.id] ?? []
      updatedDayEntries[day.id] = entries.map((e) => {
        const serverId = savedIds[savedIdx++]
        return e.id === null && serverId ? { ...e, id: serverId } : e
      })
    }

    setDayEntries(updatedDayEntries)
    setDeletedEntryIds([])
    setTimetableSaving(false)
    setTimetableSuccess(true)
    setTimeout(() => setTimetableSuccess(false), 3000)
  }

  // ---------------------------------------------------------------------------
  // Entry change handlers (passed down to TimetableBuilder)
  // ---------------------------------------------------------------------------

  function handleEntriesChange(dayId: string, entries: EntryDraft[]) {
    setDayEntries((prev) => ({ ...prev, [dayId]: entries }))
    // Clear validation errors for this day as user edits
    setValidationErrors((prev) => {
      const next = { ...prev }
      delete next[dayId]
      return next
    })
    setTimetableSuccess(false)
  }

  function handleDeleteEntry(dayId: string, localId: string) {
    const entry = (dayEntries[dayId] ?? []).find((e) => e._localId === localId)
    if (entry?.id) {
      setDeletedEntryIds((prev) => [...prev, entry.id as string])
    }
    setDayEntries((prev) => ({
      ...prev,
      [dayId]: (prev[dayId] ?? []).filter((e) => e._localId !== localId),
    }))
  }

  // ---------------------------------------------------------------------------
  // Dialog descriptions
  // ---------------------------------------------------------------------------

  const dialogConfig: Record<DialogKind, { title: string; description: string; label: string; destructive?: boolean }> = {
    publish:   { title: 'Publish this event?', description: 'It will become publicly visible immediately.', label: 'Publish' },
    unpublish: { title: 'Unpublish this event?', description: 'Public access will be removed. You can republish at any time.', label: 'Unpublish', destructive: true },
    archive:   { title: 'Archive this event?', description: 'The event will be hidden from your dashboard. You can still access it via direct link.', label: 'Archive', destructive: true },
    duplicate: { title: 'Duplicate this event', description: 'Creates a full copy of the event and all its timetable entries in draft status.', label: 'Duplicate' },
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-8">

      {/* ── Event metadata ─────────────────────────────────────────────────── */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-800">Event details</h2>
            <StatusBadge status={status} />
          </div>
          {/* Status action buttons */}
          <div className="flex items-center gap-2">
            {status === 'draft' && (
              <button
                type="button"
                onClick={() => { setDialog('publish'); setDialogError(null) }}
                className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Publish
              </button>
            )}
            {status === 'published' && (
              <button
                type="button"
                onClick={() => { setDialog('unpublish'); setDialogError(null) }}
                className="px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Unpublish
              </button>
            )}
            {status !== 'archived' && (
              <button
                type="button"
                onClick={() => { setDialog('archive'); setDialogError(null) }}
                className="px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Archive
              </button>
            )}
            <button
              type="button"
              onClick={() => { setDialog('duplicate'); setDialogError(null); setDupTitle(title + ' (copy)'); setDupStartDate(startDate); setDupEndDate(endDate) }}
              className="px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Duplicate
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveMetadata} className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          {/* Venue */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Venue</label>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. Whilton Mill Karting"
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          {/* Dates + timezone */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End date *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
              >
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
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Notes <span className="text-gray-400 font-normal">(internal, not shown publicly)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Organiser notes…"
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
            />
          </div>

          {/* Save row */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={metaSaving}
              className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {metaSaving ? 'Saving…' : 'Save details'}
            </button>
            {metaSuccess && !metaSaving && (
              <p className="text-sm text-green-600">Saved.</p>
            )}
            {metaError && (
              <p className="text-sm text-red-600">{metaError}</p>
            )}
          </div>
        </form>
      </section>

      {/* ── Timetable builder ───────────────────────────────────────────────── */}
      <section id="timetable-section" className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Timetable</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Add entries for each day. Drag rows to reorder. Save when done.
          </p>
        </div>

        {/* Global validation errors */}
        {globalValidationErrors.length > 0 && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            {globalValidationErrors.map((e, i) => (
              <p key={i} className="text-sm text-red-700">{e}</p>
            ))}
          </div>
        )}

        <div className="px-6 py-5">
          <TimetableBuilder
            eventId={event.id}
            days={days}
            dayEntries={dayEntries}
            validationErrors={validationErrors}
            saving={timetableSaving}
            saveError={timetableError}
            saveSuccess={timetableSuccess}
            onDaysChange={setDays}
            onEntriesChange={handleEntriesChange}
            onDeleteEntry={handleDeleteEntry}
            onSave={handleSaveTimetable}
          />
        </div>
      </section>

      {/* ── Audit log ───────────────────────────────────────────────────────── */}
      <AuditLogView entries={auditLog} />

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}
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
            <input
              type="text"
              value={dupTitle}
              onChange={(e) => setDupTitle(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start date *</label>
              <input
                type="date"
                value={dupStartDate}
                onChange={(e) => setDupStartDate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End date *</label>
              <input
                type="date"
                value={dupEndDate}
                onChange={(e) => setDupEndDate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
          </div>
          {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}
        </div>
      </ConfirmDialog>

    </div>
  )
}
