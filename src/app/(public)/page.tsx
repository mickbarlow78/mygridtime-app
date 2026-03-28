/**
 * Public landing page — lists all currently published events.
 *
 * Access rules:
 *   - Only events with status = 'published' AND deleted_at IS NULL are returned.
 *   - No authentication required.
 *   - Supabase RLS enforces the same rule at the database level.
 */

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/slug'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Events',
  description: 'Published race-day timetables for motorsport events.',
}

export default async function LandingPage() {
  const supabase = createClient()

  const { data: events } = await supabase
    .from('events')
    .select('id, title, venue, start_date, end_date, slug')
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('start_date', { ascending: false })

  const eventList = events ?? []

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        {/* Wordmark */}
        <div className="mb-10">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">MyGridTime</h1>
          <p className="mt-1 text-sm text-gray-500">
            Race-day timetables for motorsport events.
          </p>
        </div>

        {/* Events list */}
        {eventList.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No published events at the moment.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {eventList.map((event) => {
              const dateStr =
                event.start_date === event.end_date
                  ? formatDate(event.start_date)
                  : `${formatDate(event.start_date)} – ${formatDate(event.end_date)}`

              return (
                <Link
                  key={event.id}
                  href={`/${event.slug}`}
                  className="flex items-center justify-between gap-4 py-4 -mx-2 px-2 rounded hover:bg-gray-50 transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 group-hover:text-gray-700 truncate">
                      {event.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {event.venue ? `${event.venue} · ` : ''}
                      {dateStr}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-gray-300 group-hover:text-gray-400">
                    →
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
