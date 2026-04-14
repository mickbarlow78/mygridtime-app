'use client'

import { useState, useTransition, useMemo } from 'react'
import type { AuditLog } from '@/lib/types/database'
import { loadMoreAuditLog, type AuditLogEntry } from '@/app/admin/events/actions'

interface AuditLogViewProps {
  entries: (AuditLog & { user_email?: string | null })[]
  eventId: string
  initialHasMore: boolean
}

// ── Labels ──────────────────────────────────────────────────────────────────

const actionLabels: Record<string, string> = {
  'event.created':               'Event created',
  'event.updated':               'Metadata updated',
  'event.published':             'Published',
  'event.unpublished':           'Unpublished',
  'event.archived':              'Archived',
  'event.duplicated':            'Duplicated from another event',
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

export function AuditLogView({ entries: initialEntries, eventId, initialHasMore }: AuditLogViewProps) {
  const [open, setOpen] = useState(false)
  const [allEntries, setAllEntries] = useState(initialEntries)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, startLoading] = useTransition()
  const [actionFilter, setActionFilter] = useState('')

  // Client-side filtering on loaded entries
  const filteredEntries = useMemo(
    () => actionFilter ? allEntries.filter((e) => e.action === actionFilter) : allEntries,
    [allEntries, actionFilter]
  )

  function handleLoadMore() {
    if (!hasMore || loading || allEntries.length === 0) return
    const cursor = allEntries[allEntries.length - 1].created_at

    startLoading(async () => {
      const result = await loadMoreAuditLog(eventId, cursor)
      if (result.success) {
        setAllEntries((prev) => [...prev, ...result.data.entries])
        setHasMore(result.data.hasMore)
      }
    })
  }

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
            <span className="ml-2 text-xs text-gray-400">{allEntries.length} entries{hasMore ? '+' : ''}</span>
          )}
        </span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div>
          {/* Filter bar */}
          {allEntries.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                aria-label="Filter by action type"
                className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
              >
                {filterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="divide-y divide-gray-100">
            {filteredEntries.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">
                {actionFilter ? 'No entries match this filter.' : 'No audit entries yet.'}
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

          {/* Load more button */}
          {hasMore && !actionFilter && (
            <div className="px-4 py-3 border-t border-gray-100">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loading}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400"
              >
                {loading ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
