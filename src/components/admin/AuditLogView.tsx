'use client'

import { useState, useTransition, useMemo, useEffect, useCallback } from 'react'
import type { AuditLog } from '@/lib/types/database'
import { loadAllAuditLog, type AuditLogEntry } from '@/app/admin/events/actions'

interface AuditLogViewProps {
  entries: (AuditLog & { user_email?: string | null })[]
  eventId: string
  initialHasMore: boolean
  /**
   * If the server-side initial audit_log query failed, the page passes its
   * user-facing error message here. Seeds `loadError` so the Retry banner
   * renders on panel open, and flips `allLoaded` to false so the existing
   * `useEffect` calls `loadAll()` on open — either clearing the banner on
   * success or replacing it with the latest error.
   */
  initialLoadError?: string | null
  /**
   * Increments to force a reload of all audit entries. Parent bumps this
   * after a successful save so newly written rows appear without requiring
   * the panel to be closed and re-opened.
   */
  refreshSignal?: number
}

// ── Labels ──────────────────────────────────────────────────────────────────

const actionLabels: Record<string, string> = {
  'event.created':               'Event created',
  'event.updated':               'Metadata updated',
  'event.published':             'Published',
  'event.unpublished':           'Unpublished',
  'event.archived':              'Archived',
  'event.duplicated':            'Duplicated from another event',
  'event_day.added':             'Day added',
  'event_day.removed':           'Day removed',
  'event_day.label_updated':     'Day label updated',
  'timetable.updated':           'Timetable updated',
  'template.created':            'Saved as template',
  'event.created_from_template': 'Created from template',
}

/** Options shown in the filter dropdown. Order matters for UX. */
const filterOptions: { value: string; label: string }[] = [
  { value: '',                          label: 'All actions' },
  { value: 'event.created',             label: 'Event created' },
  { value: 'event.updated',             label: 'Metadata updated' },
  { value: 'event.published',           label: 'Published' },
  { value: 'event.unpublished',         label: 'Unpublished' },
  { value: 'event.archived',            label: 'Archived' },
  { value: 'event.duplicated',          label: 'Duplicated from another event' },
  { value: 'event_day.added',           label: 'Day added' },
  { value: 'event_day.removed',         label: 'Day removed' },
  { value: 'event_day.label_updated',   label: 'Day label updated' },
  { value: 'timetable.updated',         label: 'Timetable updated' },
  { value: 'template.created',          label: 'Saved as template' },
  { value: 'event.created_from_template', label: 'Created from template' },
]

const metaFieldLabels: Record<string, string> = {
  title:      'Title',
  venue:      'Venue',
  start_date: 'Start date',
  end_date:   'End date',
  timezone:   'Timezone',
  notes:      'Notes',
}

const entryFieldLabels: Record<string, string> = {
  title:      'Title',
  start_time: 'Start time',
  end_time:   'End time',
  category:   'Category',
  notes:      'Notes',
  is_break:   'Break',
  sort_order: 'Position',
}

// ── Type guards ──────────────────────────────────────────────────────────────

type FieldChange = { from: unknown; to: unknown }

type MetaChangesDetail = { changes: Record<string, FieldChange> }
function isMetaChanges(d: unknown): d is MetaChangesDetail {
  return typeof d === 'object' && d !== null && 'changes' in d &&
    typeof (d as MetaChangesDetail).changes === 'object'
}

type TimetableEntrySnapshot = {
  title: string
  start_time: string
  end_time: string | null
  category: string | null
  is_break?: boolean
}
type TimetableChangedEntry = { title: string; changes: Record<string, FieldChange> }
type TimetableDetail = {
  added?:    TimetableEntrySnapshot[]
  removed?:  TimetableEntrySnapshot[]
  changed?:  TimetableChangedEntry[]
  reordered?: string[]
}
function isTimetableDetail(d: unknown): d is TimetableDetail {
  if (typeof d !== 'object' || d === null) return false
  const td = d as TimetableDetail
  return Array.isArray(td.added) || Array.isArray(td.removed) ||
    Array.isArray(td.changed) || Array.isArray(td.reordered)
}

// ── Formatting helpers ───────────────────────────────────────────────────────

function fmtVal(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return `"${val}"`
}

function fmtTime(t: string | null | undefined): string {
  return t ?? '—'
}

function fmtEntryLine(e: TimetableEntrySnapshot): string {
  const time = e.end_time
    ? `${fmtTime(e.start_time)}–${fmtTime(e.end_time)}`
    : fmtTime(e.start_time)
  const parts = [time]
  if (e.category) parts.push(e.category)
  if (e.is_break) parts.push('break')
  return `${e.title} (${parts.join(' · ')})`
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── CSV helpers ──────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function entriesToCsv(entries: Array<{ created_at: string; action: string; user_email?: string | null; detail?: unknown }>): string {
  const header = ['Timestamp', 'Action', 'User', 'Detail']
  const rows = entries.map((e) => [
    e.created_at,
    actionLabels[e.action] ?? e.action,
    e.user_email ?? '',
    e.detail ? JSON.stringify(e.detail) : '',
  ])
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Sub-renderers ────────────────────────────────────────────────────────────

function MetaDiff({ changes }: { changes: Record<string, FieldChange> }) {
  const entries = Object.entries(changes)
  if (entries.length === 0) return null
  return (
    <ul className="mt-2 space-y-0.5">
      {entries.map(([field, change]) => (
        <li key={field} className="text-xs">
          <span className="text-gray-400">{metaFieldLabels[field] ?? field}: </span>
          <span className="text-red-500">{fmtVal(change.from)}</span>
          <span className="text-gray-400 mx-1">→</span>
          <span className="text-green-600">{fmtVal(change.to)}</span>
        </li>
      ))}
    </ul>
  )
}

function TimetableDiff({ detail }: { detail: TimetableDetail }) {
  return (
    <div className="mt-2 space-y-2">

      {/* Added */}
      {detail.added && detail.added.length > 0 && (
        <div>
          <p className="text-xs font-medium text-green-700 mb-0.5">Added</p>
          <ul className="space-y-0.5">
            {detail.added.map((e, i) => (
              <li key={i} className="text-xs text-gray-600 pl-2 border-l-2 border-green-300">
                {fmtEntryLine(e)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Removed */}
      {detail.removed && detail.removed.length > 0 && (
        <div>
          <p className="text-xs font-medium text-red-600 mb-0.5">Removed</p>
          <ul className="space-y-0.5">
            {detail.removed.map((e, i) => (
              <li key={i} className="text-xs text-gray-600 pl-2 border-l-2 border-red-300">
                {fmtEntryLine(e)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Changed */}
      {detail.changed && detail.changed.length > 0 && (
        <div>
          <p className="text-xs font-medium text-amber-700 mb-0.5">Edited</p>
          <ul className="space-y-1.5">
            {detail.changed.map((entry, i) => (
              <li key={i} className="pl-2 border-l-2 border-amber-300">
                <p className="text-xs font-medium text-gray-700">{entry.title}</p>
                <ul className="space-y-0">
                  {Object.entries(entry.changes).map(([field, change]) => (
                    <li key={field} className="text-xs">
                      <span className="text-gray-400">
                        {entryFieldLabels[field] ?? field}:{' '}
                      </span>
                      <span className="text-red-500">{fmtVal(change.from)}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span className="text-green-600">{fmtVal(change.to)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reordered */}
      {detail.reordered && detail.reordered.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-0.5">
            Reordered ({detail.reordered.length} entries repositioned)
          </p>
          <p className="text-xs text-gray-400 pl-2 border-l-2 border-gray-200">
            {detail.reordered.join(', ')}
          </p>
        </div>
      )}

    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function AuditLogView({ entries: initialEntries, eventId, initialHasMore, initialLoadError = null, refreshSignal = 0 }: AuditLogViewProps) {
  const [open, setOpen] = useState(false)
  const [allEntries, setAllEntries] = useState(initialEntries)
  const [loadingAll, startLoadingAll] = useTransition()
  // On initial-load failure, `initialHasMore` collapses to false because the
  // server fell back to []. Force `allLoaded` to false in that case so the
  // panel-open effect fires `loadAll()` as a retry path.
  const [allLoaded, setAllLoaded] = useState(!initialLoadError && !initialHasMore)
  const [capped, setCapped] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(initialLoadError ?? null)

  // Filter state
  const [actionFilter, setActionFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Auto-load all entries when panel opens and there are more to load
  const loadAll = useCallback(() => {
    setLoadError(null)
    startLoadingAll(async () => {
      const result = await loadAllAuditLog(eventId)
      if (result.success) {
        setAllEntries(result.data.entries)
        setCapped(result.data.capped)
        setAllLoaded(true)
      } else {
        // Stop the retry loop — setting allLoaded prevents the effect from refiring.
        setLoadError(result.error ?? 'Could not load audit log. Please retry.')
        setAllLoaded(true)
      }
    })
  }, [eventId])

  useEffect(() => {
    if (open && !allLoaded && !loadingAll) {
      loadAll()
    }
  }, [open, allLoaded, loadingAll, loadAll])

  // Parent-driven refresh: when refreshSignal changes, flip allLoaded so the
  // panel-open effect re-runs loadAll(). Guarded so it only fires after the
  // parent has actually incremented the signal at least once.
  useEffect(() => {
    if (refreshSignal > 0) {
      setAllLoaded(false)
    }
  }, [refreshSignal])

  // Combined client-side filter pipeline
  const filteredEntries = useMemo(() => {
    let result = allEntries

    // Action filter
    if (actionFilter) {
      result = result.filter((e) => e.action === actionFilter)
    }

    // Date from (inclusive, day-level)
    if (dateFrom) {
      const from = new Date(dateFrom + 'T00:00:00')
      result = result.filter((e) => new Date(e.created_at) >= from)
    }

    // Date to (inclusive, day-level — include entire day)
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59.999')
      result = result.filter((e) => new Date(e.created_at) <= to)
    }

    // Search (case-insensitive across label, email, detail)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) => {
        const label = (actionLabels[e.action] ?? e.action).toLowerCase()
        const email = (e.user_email ?? '').toLowerCase()
        const detail = e.detail ? JSON.stringify(e.detail).toLowerCase() : ''
        return label.includes(q) || email.includes(q) || detail.includes(q)
      })
    }

    return result
  }, [allEntries, actionFilter, dateFrom, dateTo, searchQuery])

  function handleExportCsv() {
    const csv = entriesToCsv(filteredEntries)
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `audit-log-${date}.csv`)
  }

  const controlsDisabled = loadingAll && !allLoaded

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-medium text-gray-700">
          Audit log
          {allEntries.length > 0 && (
            <span className="ml-2 text-xs text-gray-400">
              {allEntries.length} entries{!allLoaded ? '+' : ''}
            </span>
          )}
        </span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div>
          {/* Filter bar */}
          {allEntries.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 space-y-2">
              {/* Row 1: action filter + search */}
              <div className="flex flex-wrap gap-2">
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  disabled={controlsDisabled}
                  aria-label="Filter by action type"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                >
                  {filterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={controlsDisabled}
                  placeholder="Search logs..."
                  aria-label="Search audit log"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 min-w-[140px] flex-1 max-w-xs"
                />
              </div>

              {/* Row 2: date range + export */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-gray-500">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  disabled={controlsDisabled}
                  aria-label="Filter from date"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                />
                <label className="text-xs text-gray-500">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  disabled={controlsDisabled}
                  aria-label="Filter to date"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                />
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={controlsDisabled || filteredEntries.length === 0}
                  className="ml-auto text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 border border-gray-200 rounded px-2 py-1 bg-white"
                >
                  Export CSV
                </button>
              </div>
            </div>
          )}

          {/* Loading indicator while fetching all entries */}
          {loadingAll && !loadError && (
            <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-100">
              Loading all entries...
            </div>
          )}

          {/* Load error — inline red banner with retry */}
          {loadError && (
            <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-gray-100 flex items-center justify-between gap-2">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => {
                  setLoadError(null)
                  setAllLoaded(false)
                }}
                className="text-xs text-red-700 hover:text-red-900 underline shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Cap warning — shown only when the 2000-row safety cap was actually hit */}
          {capped && (
            <div className="px-4 py-2 text-xs text-amber-600 bg-amber-50 border-b border-gray-100">
              Showing first 2,000 entries. Older entries are not included.
            </div>
          )}

          <div className="divide-y divide-gray-100">
            {filteredEntries.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">
                {actionFilter || searchQuery || dateFrom || dateTo
                  ? 'No entries match the current filters.'
                  : 'No audit entries yet.'}
              </p>
            ) : (
              filteredEntries.map((entry) => {
                const detail = entry.detail

                return (
                  <div key={entry.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800">
                          {actionLabels[entry.action] ?? entry.action}
                        </p>
                        {entry.user_email && (
                          <p className="text-xs text-gray-400 mt-0.5">{entry.user_email}</p>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 whitespace-nowrap shrink-0 mt-0.5">
                        {formatTimestamp(entry.created_at)}
                      </p>
                    </div>

                    {/* Metadata field diff (event.updated) */}
                    {entry.action === 'event.updated' && isMetaChanges(detail) && (
                      <MetaDiff changes={detail.changes} />
                    )}

                    {/* Timetable diff (timetable.updated) */}
                    {entry.action === 'timetable.updated' && isTimetableDetail(detail) && (
                      <TimetableDiff detail={detail} />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
