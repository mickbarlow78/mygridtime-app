'use client'

import { useState, useTransition, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  loadExtractionLog,
  type ExtractionLogEntry,
  type ExtractionStatus,
} from '@/app/admin/extractions/actions'

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

  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(
    initialLoadError ? null : new Date().toISOString(),
  )
  const [tipDismissed, setTipDismissed] = useState(false)

  const clearFilters = () => {
    setStatusFilter('')
    setSearchQuery('')
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

  const filteredEntries = useMemo(() => {
    let result = allEntries

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

    return result
  }, [allEntries, statusFilter, dateFrom, dateTo, searchQuery])

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
          Extraction log
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
          {allEntries.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 space-y-2">
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
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
                {lastUpdatedAt && (
                  <span className="text-xs text-gray-400 ml-auto">
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
              Showing first 2,000 entries. Older entries are not included.
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
              (statusFilter || searchQuery || dateFrom || dateTo) ? (
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
      )}
    </div>
  )
}
