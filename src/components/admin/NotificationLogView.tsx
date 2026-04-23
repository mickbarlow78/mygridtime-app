'use client'

import { useState, useTransition, useEffect, useCallback, useMemo } from 'react'
import { loadAllNotificationLog, type NotificationLogEntry } from '@/app/admin/events/actions'
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel'

interface NotificationLogViewProps {
  entries: NotificationLogEntry[]
  eventId: string
  initialHasMore: boolean
  /**
   * If the server-side initial notification_log query failed, the page passes
   * its user-facing error message here. Seeds `loadError` so the Retry banner
   * renders on panel open, and flips `allLoaded` to false so the existing
   * `useEffect` calls `loadAll()` on open — either clearing the banner on
   * success or replacing it with the latest error. Mirrors AuditLogView.
   */
  initialLoadError?: string | null
  /**
   * Increments to force a reload of all entries. Parent bumps this after a
   * successful save path that may have written a new notification_log row,
   * so the panel picks it up without requiring close/re-open.
   */
  refreshSignal?: number
}

const typeLabels: Record<string, string> = {
  'event.published':    'Published',
  'timetable.updated':  'Timetable updated',
}

const statusStyles: Record<NotificationLogEntry['status'], string> = {
  sent:   'bg-green-50 text-green-700 border-green-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  queued: 'bg-amber-50 text-amber-700 border-amber-200',
}

const statusFilterOptions: { value: '' | NotificationLogEntry['status']; label: string }[] = [
  { value: '',       label: 'All statuses' },
  { value: 'sent',   label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'queued', label: 'Queued' },
]

const typeFilterOptions: { value: string; label: string }[] = [
  { value: '',                   label: 'All types' },
  { value: 'event.published',    label: 'Published' },
  { value: 'timetable.updated',  label: 'Timetable updated' },
]

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Local-calendar YYYY-MM-DD. Matches <input type="date"> values and the
// local-midnight parsing in the date-range filter above, so chip presets
// never drift across UTC midnight or DST boundaries.
function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── CSV helpers ──────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function entriesToCsv(entries: NotificationLogEntry[]): string {
  const header = ['Timestamp', 'Type', 'Recipient', 'Status', 'Sent at', 'Error']
  const rows = entries.map((e) => [
    e.created_at,
    typeLabels[e.type] ?? e.type,
    e.recipient_email,
    e.status,
    e.sent_at ?? '',
    e.error ?? '',
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

export function NotificationLogView({
  entries: initialEntries,
  eventId,
  initialHasMore,
  initialLoadError = null,
  refreshSignal = 0,
}: NotificationLogViewProps) {
  const [open, setOpen] = useState(false)
  const [allEntries, setAllEntries] = useState(initialEntries)
  const [loadingAll, startLoadingAll] = useTransition()
  const [allLoaded, setAllLoaded] = useState(!initialLoadError && !initialHasMore)
  const [capped, setCapped] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(initialLoadError ?? null)
  const [statusFilter, setStatusFilter] = useState<'' | NotificationLogEntry['status']>('')
  const [typeFilter, setTypeFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const hasActiveFilters = Boolean(
    statusFilter || typeFilter || searchQuery || dateFrom || dateTo,
  )

  const loadAll = useCallback(() => {
    setLoadError(null)
    startLoadingAll(async () => {
      const result = await loadAllNotificationLog(eventId)
      if (result.success) {
        setAllEntries(result.data.entries)
        setCapped(result.data.capped)
        setAllLoaded(true)
      } else {
        setLoadError(result.error ?? 'Could not load notification history. Please retry.')
        setAllLoaded(true)
      }
    })
  }, [eventId])

  useEffect(() => {
    if (open && !allLoaded && !loadingAll) {
      loadAll()
    }
  }, [open, allLoaded, loadingAll, loadAll])

  useEffect(() => {
    if (refreshSignal > 0) {
      setAllLoaded(false)
    }
  }, [refreshSignal])

  const filteredEntries = useMemo(() => {
    let result = allEntries
    if (statusFilter) result = result.filter((e) => e.status === statusFilter)
    if (typeFilter)   result = result.filter((e) => e.type === typeFilter)
    if (dateFrom) {
      const from = new Date(dateFrom + 'T00:00:00')
      result = result.filter((e) => new Date(e.created_at) >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59.999')
      result = result.filter((e) => new Date(e.created_at) <= to)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) => {
        const email  = e.recipient_email.toLowerCase()
        const label  = (typeLabels[e.type] ?? e.type).toLowerCase()
        const status = e.status.toLowerCase()
        const error  = (e.error ?? '').toLowerCase()
        return email.includes(q) || label.includes(q) || status.includes(q) || error.includes(q)
      })
    }
    return result
  }, [allEntries, statusFilter, typeFilter, dateFrom, dateTo, searchQuery])

  function handleExportCsv() {
    const csv = entriesToCsv(filteredEntries)
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `notification-log-${date}.csv`)
  }

  const controlsDisabled = loadingAll && !allLoaded

  type DateRangeKey =
    | 'all' | 'today' | 'yesterday' | '7d' | '30d'
    | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'custom'
  type AppliableDateRangeKey = Exclude<DateRangeKey, 'custom'>

  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  const todayIso = toLocalIsoDate(today)

  // Single source of truth for the date-range dropdown. Every mutation path
  // (preset chips, dropdown change) and the derived `dateRangeValue` read
  // goes through this map; 'custom' is a derivation outcome, not applyable.
  const dateRangePresets: Record<AppliableDateRangeKey, { from: string; to: string }> = {
    all:       { from: '',                                             to: ''                                          },
    today:     { from: todayIso,                                       to: todayIso                                    },
    yesterday: { from: toLocalIsoDate(new Date(y, m, d - 1)),          to: toLocalIsoDate(new Date(y, m, d - 1))       },
    '7d':      { from: toLocalIsoDate(new Date(y, m, d - 6)),          to: todayIso                                    },
    '30d':     { from: toLocalIsoDate(new Date(y, m, d - 29)),         to: todayIso                                    },
    thisMonth: { from: toLocalIsoDate(new Date(y, m, 1)),              to: todayIso                                    },
    lastMonth: { from: toLocalIsoDate(new Date(y, m - 1, 1)),          to: toLocalIsoDate(new Date(y, m, 0))           },
    thisYear:  { from: toLocalIsoDate(new Date(y, 0, 1)),              to: todayIso                                    },
    lastYear:  { from: toLocalIsoDate(new Date(y - 1, 0, 1)),          to: toLocalIsoDate(new Date(y - 1, 11, 31))     },
  }

  const dateRangeValue: DateRangeKey =
    (Object.entries(dateRangePresets) as [AppliableDateRangeKey, { from: string; to: string }][])
      .find(([, r]) => r.from === dateFrom && r.to === dateTo)?.[0] ?? 'custom'

  const isFailuresToday =
    statusFilter === 'failed' &&
    !typeFilter &&
    !searchQuery &&
    dateFrom === todayIso &&
    dateTo === todayIso
  const isSentToday =
    statusFilter === 'sent' &&
    !typeFilter &&
    !searchQuery &&
    dateFrom === todayIso &&
    dateTo === todayIso
  const isPublishedToday =
    typeFilter === 'event.published' &&
    !statusFilter &&
    !searchQuery &&
    dateFrom === todayIso &&
    dateTo === todayIso

  function clearAllFilters() {
    setStatusFilter('')
    setTypeFilter('')
    setSearchQuery('')
    setDateFrom('')
    setDateTo('')
  }

  function applyPreset(next: {
    statusFilter: '' | NotificationLogEntry['status']
    typeFilter: string
  }) {
    const { from, to } = dateRangePresets.today
    setStatusFilter(next.statusFilter)
    setTypeFilter(next.typeFilter)
    setSearchQuery('')
    setDateFrom(from)
    setDateTo(to)
  }

  const chipClass = (active: boolean, activeClasses: string) =>
    `text-xs rounded border px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      active
        ? activeClasses
        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
    }`

  function handleDateRangeChange(value: DateRangeKey) {
    if (value === 'custom') return
    const { from, to } = dateRangePresets[value]
    setDateFrom(from)
    setDateTo(to)
  }

  return (
    <CollapsiblePanel
      title="Notification history"
      count={allEntries.length}
      open={open}
      onOpenChange={setOpen}
    >
      <div>
          {allEntries.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 space-y-2">
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-gray-400 self-center">Presets</span>
                <button
                  type="button"
                  onClick={() =>
                    isFailuresToday
                      ? clearAllFilters()
                      : applyPreset({ statusFilter: 'failed', typeFilter: '' })
                  }
                  aria-pressed={isFailuresToday}
                  disabled={controlsDisabled}
                  className={chipClass(
                    isFailuresToday,
                    'bg-red-50 text-red-700 border-red-200',
                  )}
                >
                  Failures today
                </button>
                <button
                  type="button"
                  onClick={() =>
                    isSentToday
                      ? clearAllFilters()
                      : applyPreset({ statusFilter: 'sent', typeFilter: '' })
                  }
                  aria-pressed={isSentToday}
                  disabled={controlsDisabled}
                  className={chipClass(
                    isSentToday,
                    'bg-green-50 text-green-700 border-green-200',
                  )}
                >
                  Sent today
                </button>
                <button
                  type="button"
                  onClick={() =>
                    isPublishedToday
                      ? clearAllFilters()
                      : applyPreset({ statusFilter: '', typeFilter: 'event.published' })
                  }
                  aria-pressed={isPublishedToday}
                  disabled={controlsDisabled}
                  className={chipClass(
                    isPublishedToday,
                    'bg-blue-50 text-blue-700 border-blue-200',
                  )}
                >
                  Published today
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as '' | NotificationLogEntry['status'])}
                  disabled={controlsDisabled}
                  aria-label="Filter by status"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                >
                  {statusFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  disabled={controlsDisabled}
                  aria-label="Filter by type"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                >
                  {typeFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  value={dateRangeValue}
                  onChange={(e) => handleDateRangeChange(e.target.value as DateRangeKey)}
                  disabled={controlsDisabled}
                  aria-label="Filter by date range"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                >
                  <option value="all">All time</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="thisMonth">This month</option>
                  <option value="lastMonth">Last month</option>
                  <option value="thisYear">This year</option>
                  <option value="lastYear">Last year</option>
                  {dateRangeValue === 'custom' && (
                    <option value="custom" disabled>Custom</option>
                  )}
                </select>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={controlsDisabled}
                  placeholder="Search notifications..."
                  aria-label="Search notification log"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 min-w-[140px] flex-1 max-w-xs"
                />
              </div>

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
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    disabled={controlsDisabled}
                    className="ml-auto text-xs text-gray-600 hover:text-gray-800 disabled:text-gray-400 border border-gray-200 rounded px-2 py-1 bg-white"
                  >
                    Clear filters
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={controlsDisabled || filteredEntries.length === 0}
                  className={`${hasActiveFilters ? '' : 'ml-auto '}text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 border border-gray-200 rounded px-2 py-1 bg-white`}
                >
                  Export CSV
                </button>
              </div>
            </div>
          )}

          {loadingAll && !loadError && (
            <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-100">
              Loading all entries...
            </div>
          )}

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

          {capped && (
            <div className="px-4 py-2 text-xs text-amber-600 bg-amber-50 border-b border-gray-100">
              Showing first 2,000 entries. Older entries are not included.
            </div>
          )}

          <div className="divide-y divide-gray-100">
            {filteredEntries.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">
                {statusFilter || typeFilter || dateFrom || dateTo || searchQuery
                  ? 'No entries match the current filters.'
                  : 'No notifications sent yet.'}
              </p>
            ) : (
              filteredEntries.map((entry) => (
                <div key={entry.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">
                        {entry.recipient_email}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{typeLabels[entry.type] ?? entry.type}</span>
                        <span
                          className={`inline-block border rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusStyles[entry.status]}`}
                        >
                          {entry.status}
                        </span>
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 whitespace-nowrap shrink-0 mt-0.5">
                      {formatTimestamp(entry.created_at)}
                    </p>
                  </div>

                  {entry.status === 'failed' && entry.error && (
                    <p className="text-xs text-red-600 mt-1 break-words">
                      {entry.error}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
    </CollapsiblePanel>
  )
}
