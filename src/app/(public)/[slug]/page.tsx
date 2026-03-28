/**
 * Public event timetable page — /[slug]
 *
 * Access rules (enforced here AND in Supabase RLS):
 *   - Only published events are accessible.
 *   - Draft events → 404.
 *   - Archived events → 404.
 *   - Unknown slugs → 404.
 *   - No authentication required.
 *
 * Day selection:
 *   - Passed via ?day=YYYY-MM-DD search param (ISO date string).
 *   - If the event is running today, today's date is pre-selected.
 *   - Falls back to the first day if the param is absent or invalid.
 *   - Single-day events show no tabs.
 */

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { TimetableDay } from '@/components/public/TimetableDay'
import type { PublicEntry } from '@/components/public/TimetableDay'
import { formatDate } from '@/lib/utils/slug'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { slug: string }
  searchParams: { day?: string }
}

// ---------------------------------------------------------------------------
// SEO metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const supabase = createClient()

  const { data: event } = await supabase
    .from('events')
    .select('title, venue, start_date, end_date')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  if (!event) return { title: 'Event not found' }

  const dateStr =
    event.start_date === event.end_date
      ? formatDate(event.start_date)
      : `${formatDate(event.start_date)} – ${formatDate(event.end_date)}`

  return {
    title: event.title,
    description: [event.venue, dateStr].filter(Boolean).join(' · '),
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PublicTimetablePage({ params, searchParams }: PageProps) {
  const supabase = createClient()

  // Fetch the event — published only, explicit select (no admin fields)
  const { data: event } = await supabase
    .from('events')
    .select('id, title, venue, start_date, end_date, slug')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  if (!event) notFound()

  // Fetch event days, sorted
  const { data: days } = await supabase
    .from('event_days')
    .select('id, date, label, sort_order')
    .eq('event_id', event.id)
    .order('sort_order', { ascending: true })
    .order('date', { ascending: true })

  const dayList = days ?? []

  // Determine active day
  // Priority: 1) valid ?day= param  2) today if event is running  3) first day
  const today = new Date().toISOString().split('T')[0]
  const requestedDate = searchParams.day
  const activeDay = requestedDate
    ? (dayList.find((d) => d.date === requestedDate) ?? dayList[0])
    : (dayList.find((d) => d.date === today) ?? dayList[0])

  // Fetch entries for the active day only (not all days — keeps the query small)
  let entries: PublicEntry[] = []
  if (activeDay) {
    const { data } = await supabase
      .from('timetable_entries')
      .select('id, title, start_time, end_time, category, notes, is_break, sort_order')
      .eq('event_day_id', activeDay.id)
      .order('sort_order', { ascending: true })
    entries = (data ?? []) as PublicEntry[]
  }

  // Date range for the header subtitle
  const dateRange =
    event.start_date === event.end_date
      ? formatDate(event.start_date)
      : `${formatDate(event.start_date)} – ${formatDate(event.end_date)}`

  return (
    <div className="min-h-screen bg-white">
      {/* ── Event header ── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 leading-tight">
                {event.title}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {event.venue && <span>{event.venue} · </span>}
                <span>{dateRange}</span>
              </p>
            </div>
            {/* Print link — opens print page in new tab */}
            <Link
              href={`/${params.slug}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2.5 py-1.5 hover:border-gray-300 transition-colors whitespace-nowrap"
            >
              Print
            </Link>
          </div>
        </div>
      </div>

      {/* ── Day tabs — only for multi-day events ── */}
      {dayList.length > 1 && (
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            {/*
              overflow-x-auto + flex lets tabs scroll horizontally on narrow
              screens without wrapping. -mb-px aligns the active border-b
              with the container's bottom border.
            */}
            <div className="flex overflow-x-auto gap-0 -mb-px">
              {dayList.map((day) => {
                const isActive = day.id === activeDay?.id
                const label = day.label || formatDate(day.date)
                return (
                  <Link
                    key={day.id}
                    href={`/${params.slug}?day=${day.date}`}
                    className={[
                      'shrink-0 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                      isActive
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                    ].join(' ')}
                  >
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Timetable content ── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {dayList.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No timetable has been published yet.
          </div>
        ) : (
          <>
            {/* Single-day event: show the day label as a heading instead of tabs */}
            {dayList.length === 1 && dayList[0] && (
              <p className="text-sm font-medium text-gray-500 mb-4">
                {dayList[0].label || formatDate(dayList[0].date)}
              </p>
            )}
            <TimetableDay entries={entries} />
          </>
        )}
      </div>
    </div>
  )
}
