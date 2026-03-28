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
            entries.map((entry) => (
              <div key={entry.id} className="px-4 py-2.5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-800">
                    {actionLabels[entry.action] ?? entry.action}
                  </p>
                  {entry.user_email && (
                    <p className="text-xs text-gray-400 mt-0.5">{entry.user_email}</p>
                  )}
                </div>
                <p className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                  {formatTimestamp(entry.created_at)}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
