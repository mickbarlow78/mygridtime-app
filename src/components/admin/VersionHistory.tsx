'use client'

import { useState } from 'react'
import { getSnapshotData } from '@/app/admin/events/actions'
import type { VersionSummary, SnapshotDay } from '@/app/admin/events/actions'
import { TimetableDay } from '@/components/public/TimetableDay'
import type { PublicEntry } from '@/components/public/TimetableDay'
import { formatDate } from '@/lib/utils/slug'
import { cn } from '@/lib/styles'
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel'

interface VersionHistoryProps {
  versions: VersionSummary[]
}

export function VersionHistory({ versions }: VersionHistoryProps) {
  const [viewingSnapshot, setViewingSnapshot] = useState<{
    version: number
    published_at: string
    days: SnapshotDay[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeDayIndex, setActiveDayIndex] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastAttemptedSnapshotId, setLastAttemptedSnapshotId] = useState<string | null>(null)

  if (versions.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg bg-white px-4 py-6 text-center">
        <p className="text-sm text-gray-400">
          No versions yet. A snapshot is saved each time you publish.
        </p>
      </div>
    )
  }

  async function handleView(snapshotId: string) {
    setLoadError(null)
    setLastAttemptedSnapshotId(snapshotId)
    setLoading(true)
    try {
      const result = await getSnapshotData(snapshotId)
      if (result.success) {
        setViewingSnapshot({
          version: result.data.version,
          published_at: result.data.published_at,
          days: result.data.data,
        })
        setActiveDayIndex(0)
        setLastAttemptedSnapshotId(null)
      } else {
        setLoadError(result.error ?? 'Could not load this snapshot. Please retry.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleRetry() {
    if (!lastAttemptedSnapshotId) return
    void handleView(lastAttemptedSnapshotId)
  }

  function handleDismissError() {
    setLoadError(null)
    setLastAttemptedSnapshotId(null)
  }

  function handleClose() {
    setViewingSnapshot(null)
  }

  return (
    <CollapsiblePanel title="Version history" count={versions.length}>
      <div>
          {/* Inline error banner */}
          {loadError && (
            <div
              role="alert"
              aria-live="polite"
              className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="flex-1">{loadError}</p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={loading || !lastAttemptedSnapshotId}
                    className="font-medium text-red-700 underline underline-offset-2 hover:text-red-900 disabled:opacity-50"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissError}
                    className="font-medium text-red-700 underline underline-offset-2 hover:text-red-900"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Version list */}
          <div className="divide-y divide-gray-100">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <div>
                  <span className="font-medium text-gray-900">v{v.version}</span>
                  <span className="text-gray-400 ml-2">
                    {new Date(v.published_at).toLocaleString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {v.published_by_email && (
                    <span className="text-gray-400 ml-2">by {v.published_by_email}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleView(v.id)}
                  disabled={loading}
                  className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2 transition-colors disabled:opacity-50"
                >
                  View
                </button>
              </div>
            ))}
          </div>

          {/* Snapshot viewer modal */}
          {viewingSnapshot && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col">
                {/* Modal header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      Version {viewingSnapshot.version}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Published{' '}
                      {new Date(viewingSnapshot.published_at).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Day tabs */}
                {viewingSnapshot.days.length > 1 && (
                  <div className="border-b border-gray-200 px-5 shrink-0">
                    <div className="flex gap-0 -mb-px overflow-x-auto">
                      {viewingSnapshot.days.map((day, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setActiveDayIndex(i)}
                          className={cn(
                            'shrink-0 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors',
                            i === activeDayIndex
                              ? 'border-gray-900 text-gray-900'
                              : 'border-transparent text-gray-500 hover:text-gray-700',
                          )}
                        >
                          {day.label || formatDate(day.date)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timetable content */}
                <div className="px-5 py-4 overflow-y-auto">
                  {viewingSnapshot.days.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">
                      No timetable data in this snapshot.
                    </p>
                  ) : (
                    <>
                      {viewingSnapshot.days.length === 1 && viewingSnapshot.days[0] && (
                        <p className="text-xs font-medium text-gray-500 mb-3">
                          {viewingSnapshot.days[0].label || formatDate(viewingSnapshot.days[0].date)}
                        </p>
                      )}
                      <TimetableDay
                        entries={
                          (viewingSnapshot.days[activeDayIndex]?.entries ?? []).map(
                            (e, idx) =>
                              ({
                                id: `snap-${idx}`,
                                title: e.title,
                                start_time: e.start_time,
                                end_time: e.end_time,
                                category: e.category,
                                notes: e.notes,
                                is_break: e.is_break,
                              }) satisfies PublicEntry
                          )
                        }
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
    </CollapsiblePanel>
  )
}
