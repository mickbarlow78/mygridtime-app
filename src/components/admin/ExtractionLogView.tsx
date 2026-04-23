'use client'

import { useState, useTransition, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  loadExtractionLog,
  type ExtractionLogEntry,
  type ExtractionStatus,
} from '@/app/admin/extractions/actions'
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel'

interface ExtractionLogViewProps {
  entries: ExtractionLogEntry[]
  orgId: string
  initialHasMore: boolean
  initialLoadError?: string | null
  /**
   * Increments to force a reload of all extraction entries. Parent bumps
   * this after a successful save so newly written rows appear without
   * requiring the panel to be closed and re-opened. Mirrors DEC-027.
   */
  refreshSignal?: number
}

// ── Labels ──────────────────────────────────────────────────────────────────

const statusLabels: Record<ExtractionStatus, string> = {
  success:           'Success',
  error:             'Error',
  rate_limited:      'Rate limited',
  validation_failed: 'Validation failed',
}

const statusFilterOptions: { value: '' | ExtractionStatus; label: string }[] = [
  { value: '',                  label: 'All statuses' },
  { value: 'success',           label: 'Success' },
  { value: 'error',             label: 'Error' },
  { value: 'rate_limited',      label: 'Rate limited' },
  { value: 'validation_failed', label: 'Validation failed' },
]

// ── Formatting helpers ───────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Local-calendar YYYY-MM-DD. Matches <input type="date"> values and the
// local-midnight parsing in the date-range filter, so triage chip presets
// never drift across UTC midnight or DST boundaries (DEC-024).
function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type ChipFilter = '' | 'problems-today' | 'all-problems'
type SortOrder = 'newest' | 'oldest'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function shortMime(mime: string): string {
  if (mime === 'application/pdf') return 'PDF'
  if (mime === 'image/png') return 'PNG'
  if (mime === 'image/jpeg') return 'JPG'
  return mime
}

function statusPillClass(status: ExtractionStatus): string {
  switch (status) {
    case 'success':           return 'bg-green-50 text-green-700 border-green-200'
    case 'error':             return 'bg-red-50 text-red-700 border-red-200'
    case 'rate_limited':      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'validation_failed': return 'bg-orange-50 text-orange-800 border-orange-200'
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export function ExtractionLogView({
  entries: initialEntries,
  orgId,
  initialHasMore,
  initialLoadError = null,
  refreshSignal = 0,
}: ExtractionLogViewProps) {
  const [open, setOpen] = useState(false)
  const [allEntries, setAllEntries] = useState(initialEntries)
  const [loadingAll, startLoadingAll] = useTransition()
  const [allLoaded, setAllLoaded] = useState(!initialLoadError && !initialHasMore)
  const [capped, setCapped] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(initialLoadError ?? null)

  const [statusFilter, setStatusFilter] = useState<'' | ExtractionStatus>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [chipFilter, setChipFilter] = useState<ChipFilter>('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [activeBreakdownCode, setActiveBreakdownCode] = useState<string | null>(null)

  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(
    initialLoadError ? null : new Date().toISOString(),
  )
  const [tipDismissed, setTipDismissed] = useState(false)

  const hasActiveFilters = Boolean(
    statusFilter || searchQuery || dateFrom || dateTo || chipFilter,
  )

  const clearFilters = () => {
    setStatusFilter('')
    setSearchQuery('')
    setDateFrom('')
    setDateTo('')
    setChipFilter('')
    setSortOrder('newest')
    setActiveBreakdownCode(null)
  }

  const applyChip = (chip: Exclude<ChipFilter, ''>) => {
    setStatusFilter('')
    setSearchQuery('')
    setDateFrom('')
    setDateTo('')
    setChipFilter(chip)
    setActiveBreakdownCode(null)
  }

  const applyBreakdown = (code: string) => {
    if (activeBreakdownCode === code) {
      setActiveBreakdownCode(null)
      setSearchQuery('')
      setChipFilter('')
      setStatusFilter('')
      return
    }
    setActiveBreakdownCode(code)
    setSearchQuery(code)
    setChipFilter('all-problems')
    setStatusFilter('')
    setDateFrom('')
    setDateTo('')
  }

  const loadAll = useCallback(() => {
    setLoadError(null)
    startLoadingAll(async () => {
      const result = await loadExtractionLog(orgId)
      if (result.success) {
        setAllEntries(result.data.entries)
        setCapped(result.data.capped)
        setAllLoaded(true)
        setLastUpdatedAt(new Date().toISOString())
      } else {
        setLoadError(result.error ?? 'Could not load extraction log. Please retry.')
        setAllLoaded(true)
      }
    })
  }, [orgId])

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

  const todayIso = toLocalIsoDate(new Date())

  // Metrics derive from ALL loaded rows — not affected by filters, chips, or
  // search. They answer "system health" questions ("how many attempts?",
  // "how many failed today?") rather than "what matches my filter view?".
  // Capped at 2000 alongside `allEntries`; the cap banner below surfaces that.
  const metrics = useMemo(() => {
    let today = 0
    let succeeded = 0
    let failed = 0
    const failureCounts = new Map<string, number>()
    for (const e of allEntries) {
      if (e.status === 'success') {
        succeeded++
      } else {
        failed++
        const code = e.error_code ?? 'unknown'
        failureCounts.set(code, (failureCounts.get(code) ?? 0) + 1)
      }
      if (toLocalIsoDate(new Date(e.created_at)) === todayIso) today++
    }
    const attempts = allEntries.length
    const failureRate = attempts > 0 ? Math.round((failed / attempts) * 100) : 0
    const failureBreakdown = Array.from(failureCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([code, count]) => ({ code, count }))
    return { attempts, today, succeeded, failed, failureRate, failureBreakdown }
  }, [allEntries, todayIso])

  const filteredEntries = useMemo(() => {
    let result = allEntries

    if (chipFilter) {
      result = result.filter((e) => e.status !== 'success')
      if (chipFilter === 'problems-today') {
        const from = new Date(todayIso + 'T00:00:00')
        const to = new Date(todayIso + 'T23:59:59.999')
        result = result.filter((e) => {
          const ts = new Date(e.created_at)
          return ts >= from && ts <= to
        })
      }
    }

    if (statusFilter) {
      result = result.filter((e) => e.status === statusFilter)
    }

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
        const email = (e.user_email ?? '').toLowerCase()
        const code = (e.error_code ?? '').toLowerCase()
        const model = (e.model ?? '').toLowerCase()
        const title = (e.event_title ?? '').toLowerCase()
        return email.includes(q) || code.includes(q) || model.includes(q) || title.includes(q)
      })
    }

    if (sortOrder === 'oldest') {
      result = [...result].reverse()
    }

    return result
  }, [allEntries, statusFilter, dateFrom, dateTo, searchQuery, chipFilter, sortOrder, todayIso])

  const controlsDisabled = loadingAll && !allLoaded

  return (
    <CollapsiblePanel
      title="Extraction log"
      count={allEntries.length}
      open={open}
      onOpenChange={setOpen}
    >
      <div>
          <div className="px-4 py-3 border-b border-gray-100 bg-white grid grid-cols-4 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400">Attempts</div>
              <div className="text-lg font-semibold text-gray-800 leading-tight">{metrics.attempts}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400">Today</div>
              <div className="text-lg font-semibold text-gray-800 leading-tight">{metrics.today}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400">Succeeded</div>
              <div className="text-lg font-semibold text-gray-800 leading-tight">{metrics.succeeded}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400">Failed</div>
              <div className="text-lg font-semibold text-gray-800 leading-tight">{metrics.failed}</div>
              {metrics.attempts > 0 && (
                <div className="text-[10px] text-gray-400 leading-tight mt-0.5">↑ {metrics.failureRate}%</div>
              )}
            </div>
          </div>
          {metrics.failureBreakdown.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 bg-white flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-gray-400">Top failures</span>
              {metrics.failureBreakdown.map(({ code, count }) => {
                const isActive = activeBreakdownCode === code
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => applyBreakdown(code)}
                    aria-pressed={isActive}
                    disabled={controlsDisabled}
                    className={`inline-flex items-center text-xs rounded border px-2 py-1 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActive
                        ? 'bg-red-50 text-red-700 border-red-300'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span className="font-mono">{code}</span>
                    <span className={`ml-1 ${isActive ? 'text-red-500' : 'text-gray-400'}`}>({count})</span>
                  </button>
                )
              })}
            </div>
          )}
          {allEntries.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 space-y-2">
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-gray-400 self-center">Presets</span>
                <button
                  type="button"
                  onClick={() =>
                    chipFilter === 'problems-today'
                      ? setChipFilter('')
                      : applyChip('problems-today')
                  }
                  aria-pressed={chipFilter === 'problems-today'}
                  disabled={controlsDisabled}
                  className={`text-xs rounded border px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    chipFilter === 'problems-today'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Problems today
                </button>
                <button
                  type="button"
                  onClick={() =>
                    chipFilter === 'all-problems'
                      ? setChipFilter('')
                      : applyChip('all-problems')
                  }
                  aria-pressed={chipFilter === 'all-problems'}
                  disabled={controlsDisabled}
                  className={`text-xs rounded border px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    chipFilter === 'all-problems'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  All problems
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as '' | ExtractionStatus)}
                  disabled={controlsDisabled}
                  aria-label="Filter by status"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                >
                  {statusFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  disabled={controlsDisabled}
                  aria-label="Sort order"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    const v = e.target.value
                    setSearchQuery(v)
                    if (activeBreakdownCode && v !== activeBreakdownCode) {
                      setActiveBreakdownCode(null)
                    }
                  }}
                  disabled={controlsDisabled}
                  placeholder="Search logs..."
                  aria-label="Search extraction log"
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
                    onClick={clearFilters}
                    disabled={controlsDisabled}
                    className="ml-auto text-xs text-gray-600 hover:text-gray-800 disabled:text-gray-400 border border-gray-200 rounded px-2 py-1 bg-white"
                  >
                    Clear filters
                  </button>
                )}
                {lastUpdatedAt && (
                  <span className={`text-xs text-gray-400 ${hasActiveFilters ? '' : 'ml-auto'}`}>
                    Updated · {formatTimestamp(lastUpdatedAt)}
                  </span>
                )}
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
              Showing first 2,000 entries. Metrics reflect these rows only.
            </div>
          )}

          {allEntries.length === 0 && lastUpdatedAt && (
            <div className="px-4 py-1.5 text-right text-xs text-gray-400 border-b border-gray-100">
              Updated · {formatTimestamp(lastUpdatedAt)}
            </div>
          )}

          {allEntries.length === 0 && allLoaded && !loadError && !tipDismissed && (
            <div className="px-4 py-2 text-xs bg-blue-50 text-blue-700 border-b border-blue-100 flex items-center justify-between gap-2">
              <span>Tip: only real extractions (AI enabled) are logged. Mock runs are skipped by design.</span>
              <button
                type="button"
                onClick={() => setTipDismissed(true)}
                aria-label="Dismiss tip"
                className="text-blue-700 hover:text-blue-900 shrink-0"
              >
                ×
              </button>
            </div>
          )}

          <div className="divide-y divide-gray-100">
            {filteredEntries.length === 0 ? (
              hasActiveFilters ? (
                <div className="px-4 py-6 flex flex-col items-center gap-2">
                  <p className="text-sm text-gray-500">No entries match the current filters.</p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    disabled={controlsDisabled}
                    className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="px-4 py-8 flex flex-col items-center text-center gap-1">
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-300 mb-1"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="9" y1="13" x2="15" y2="13" />
                    <line x1="9" y1="17" x2="13" y2="17" />
                  </svg>
                  <p className="text-sm text-gray-600 font-medium">No extraction attempts recorded.</p>
                  <p className="text-xs text-gray-400">Real AI extractions appear here. Mock runs are not logged.</p>
                </div>
              )
            ) : (
              filteredEntries.map((entry) => (
                <div key={entry.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          title={statusLabels[entry.status]}
                          className={`inline-flex items-center text-[10px] uppercase tracking-wide font-medium border rounded px-1.5 py-0.5 ${statusPillClass(entry.status)}`}
                        >
                          <span
                            aria-hidden="true"
                            className="w-1.5 h-1.5 rounded-full bg-current mr-1"
                          />
                          {statusLabels[entry.status]}
                        </span>
                        <span className="text-xs text-gray-500">
                          {shortMime(entry.source_mime)} · {formatBytes(entry.source_bytes)}
                        </span>
                      </div>
                      {entry.user_email && (
                        <p className="text-xs text-gray-400">{entry.user_email}</p>
                      )}
                      {entry.status === 'success' && (entry.model || entry.tokens_input != null || entry.tokens_output != null) && (
                        <p className="text-xs text-gray-500">
                          {entry.model && <span className="text-gray-700">{entry.model}</span>}
                          {entry.model && (entry.tokens_input != null || entry.tokens_output != null) && <span className="text-gray-400"> · </span>}
                          {entry.tokens_input != null && <>in <span className="text-gray-700">{entry.tokens_input}</span></>}
                          {entry.tokens_input != null && entry.tokens_output != null && <span className="text-gray-400"> / </span>}
                          {entry.tokens_output != null && <>out <span className="text-gray-700">{entry.tokens_output}</span></>}
                        </p>
                      )}
                      {entry.status !== 'success' && entry.error_code && (
                        <p className="text-xs text-red-600 font-mono">{entry.error_code}</p>
                      )}
                      {entry.event_id && (
                        entry.event_deleted ? (
                          <p className="text-xs text-gray-400 italic">(event deleted)</p>
                        ) : entry.event_title ? (
                          <p className="text-xs">
                            <Link
                              href={`/admin/events/${entry.event_id}`}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {entry.event_title}
                            </Link>
                          </p>
                        ) : null
                      )}
                    </div>
                    <p className="text-xs text-gray-400 whitespace-nowrap shrink-0 mt-0.5">
                      {formatTimestamp(entry.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
    </CollapsiblePanel>
  )
}
