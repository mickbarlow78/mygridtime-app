'use client'

import { useState } from 'react'
import type { AuditLog } from '@/lib/types/database'

interface AuditLogViewProps {
  entries: (AuditLog & { user_email?: string | null })[]
}

const actionLabels: Record<string, string> = {
  'event.created':     'Event created',
  'event.updated':     'Metadata updated',
  'event.published':   'Published',
  'event.unpublished': 'Unpublished',
  'event.archived':    'Archived',
  'event.duplicated':  'Duplicated from another event',
}

const fieldLabels: Record<string, string> = {
  title:      'Title',
  venue:      'Venue',
  start_date: 'Start date',
  end_date:   'End date',
  timezone:   'Timezone',
  notes:      'Notes',
}

type FieldChange = { from: string | null; to: string | null }
type ChangesDetail = { changes: Record<string, FieldChange> }

function isChangesDetail(d: unknown): d is ChangesDetail {
  return (
    typeof d === 'object' &&
    d !== null &&
    'changes' in d &&
    typeof (d as ChangesDetail).changes === 'object'
  )
}

function formatValue(val: string | null): string {
  if (val === null || val === '') return '—'
  return `"${val}"`
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AuditLogView({ entries }: AuditLogViewProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-medium text-gray-700">
          Audit log
          {entries.length > 0 && (
            <span className="ml-2 text-xs text-gray-400">{entries.length} entries</span>
          )}
        </span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="divide-y divide-gray-100">
          {entries.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">No audit entries yet.</p>
          ) : (
            entries.map((entry) => {
              const detail = entry.detail
              const hasChanges = isChangesDetail(detail)
              const changes = hasChanges ? detail.changes : null

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

                  {/* Field-level diff for event.updated */}
                  {changes && Object.keys(changes).length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {Object.entries(changes).map(([field, change]) => (
                        <li key={field} className="text-xs text-gray-500 font-mono">
                          <span className="text-gray-400 not-italic font-sans">
                            {fieldLabels[field] ?? field}:{' '}
                          </span>
                          <span className="text-red-500">{formatValue(change.from)}</span>
                          <span className="text-gray-400 mx-1">→</span>
                          <span className="text-green-600">{formatValue(change.to)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
