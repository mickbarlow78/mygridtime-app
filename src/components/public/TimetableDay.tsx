/**
 * TimetableDay — renders all entries for a single event day.
 *
 * Used by both the main public timetable page (one day at a time)
 * and the print view (all days in sequence).
 *
 * Break entries are visually distinct: centred text flanked by ruled lines.
 * Regular entries show time, title, optional notes, and optional category.
 */

import { formatTime } from '@/lib/utils/time'

/** Public-facing subset of a timetable entry row. */
export interface PublicEntry {
  id: string
  title: string
  start_time: string
  end_time: string | null
  category: string | null
  notes: string | null
  is_break: boolean
}

interface TimetableDayProps {
  entries: PublicEntry[]
}

export function TimetableDay({ entries }: TimetableDayProps) {
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        No entries scheduled for this day.
      </div>
    )
  }

  return (
    <div>
      {entries.map((entry) =>
        entry.is_break ? (
          <BreakEntry key={entry.id} entry={entry} />
        ) : (
          <RegularEntry key={entry.id} entry={entry} />
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Regular entry
// ---------------------------------------------------------------------------

function RegularEntry({ entry }: { entry: PublicEntry }) {
  return (
    <div className="grid grid-cols-[72px_1fr] sm:grid-cols-[80px_1fr_auto] gap-x-4 py-3 border-b border-gray-100 last:border-0 items-start">
      {/* Time column */}
      <div className="font-mono text-sm tabular-nums leading-5 pt-px">
        <span className="text-gray-700">{formatTime(entry.start_time)}</span>
        {entry.end_time && (
          <span className="block text-xs text-gray-400">{formatTime(entry.end_time)}</span>
        )}
      </div>

      {/* Title + notes column */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 leading-5">{entry.title}</p>
        {entry.notes && (
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{entry.notes}</p>
        )}
        {/* Category shown inline on mobile only */}
        {entry.category && (
          <span className="sm:hidden inline-block mt-1 text-xs text-gray-400">
            {entry.category}
          </span>
        )}
      </div>

      {/* Category pill — desktop only */}
      {entry.category && (
        <div className="hidden sm:flex items-start justify-end pt-px">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-gray-500 bg-gray-100">
            {entry.category}
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Break entry
// ---------------------------------------------------------------------------

function BreakEntry({ entry }: { entry: PublicEntry }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <span className="font-mono text-xs text-gray-400 tabular-nums w-[72px] sm:w-[80px] shrink-0">
        {formatTime(entry.start_time)}
      </span>
      <div className="flex flex-1 items-center gap-2">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400 italic whitespace-nowrap">{entry.title}</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
    </div>
  )
}
