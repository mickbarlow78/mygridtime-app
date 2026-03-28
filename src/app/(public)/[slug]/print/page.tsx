/**
 * Print view — /[slug]/print
 *
 * Renders all published days and their timetable entries in a single scrollable
 * page optimised for the browser's print dialog and PDF export.
 *
 * Differences from the main timetable page:
 *   - All days shown in sequence — no tabs or day switching.
 *   - Navigation chrome is hidden via print:hidden Tailwind modifiers.
 *   - A "Print / Save as PDF" button triggers window.print().
 *   - Clean typography; no sticky headers or interactive elements.
 *
 * Access rules: same as the main timetable page — published events only.
 */

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { TimetableDay } from '@/components/public/TimetableDay'
import type { PublicEntry } from '@/components/public/TimetableDay'
import { PrintButton } from '@/components/public/PrintButton'
import { formatDate } from '@/lib/utils/slug'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { slug: string }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const supabase = createClient()

  const { data: event } = await supabase
    .from('events')
    .select('title')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  return { title: event ? `${event.title} — Print` : 'Event not found' }
}

export default async function PrintTimetablePage({ params }: PageProps) {
  const supabase = createClient()

  // Published events only
  const { data: event } = await supabase
    .from('events')
    .select('id, title, venue, start_date, end_date, slug')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  if (!event) notFound()

  // All days, sorted
  const { data: days } = await supabase
    .from('event_days')
    .select('id, date, label, sort_order')
    .eq('event_id', event.id)
    .order('sort_order', { ascending: true })
    .order('date', { ascending: true })

  const dayList = days ?? []

  // All entries across all days in one query
  const { data: allEntries } = dayList.length > 0
    ? await supabase
        .from('timetable_entries')
        .select('id, event_day_id, title, start_time, end_time, category, notes, is_break, sort_order')
        .in('event_day_id', dayList.map((d) => d.id))
        .order('sort_order', { ascending: true })
    : { data: [] }

  // Group entries by day
  const entriesByDay: Record<string, PublicEntry[]> = {}
  for (const day of dayList) {
    entriesByDay[day.id] = ((allEntries ?? []) as (PublicEntry & { event_day_id: string })[])
      .filter((e) => e.event_day_id === day.id)
  }

  const dateRange =
    event.start_date === event.end_date
      ? formatDate(event.start_date)
      : `${formatDate(event.start_date)} – ${formatDate(event.end_date)}`

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-8 print:px-0 print:py-0 print:max-w-none">
        {/* Screen-only toolbar — hidden when printing */}
        <div className="print:hidden flex items-center justify-between mb-8 pb-6 border-b border-gray-200">
          <Link
            href={`/${params.slug}`}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Back to timetable
          </Link>
          <PrintButton className="text-sm text-gray-700 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50 transition-colors" />
        </div>

        {/* Print header — always visible */}
        <div className="mb-8 print:mb-6">
          <p className="text-xs text-gray-400 mb-1 print:hidden">MyGridTime</p>
          <h1 className="text-2xl font-semibold text-gray-900 leading-tight print:text-xl">
            {event.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {event.venue && <span>{event.venue} · </span>}
            <span>{dateRange}</span>
          </p>
        </div>

        {/* Timetable — all days in sequence */}
        {dayList.length === 0 ? (
          <p className="text-sm text-gray-400">No timetable has been published yet.</p>
        ) : (
          <div className="space-y-10 print:space-y-8">
            {dayList.map((day) => (
              <section key={day.id}>
                {/* Day heading — only shown for multi-day events */}
                {dayList.length > 1 && (
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-200 print:text-xs">
                    {day.label || formatDate(day.date)}
                  </h2>
                )}
                <TimetableDay entries={entriesByDay[day.id] ?? []} />
              </section>
            ))}
          </div>
        )}

        {/* Print footer */}
        <div className="hidden print:block mt-12 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-400">
            MyGridTime · {event.title} · {dateRange}
          </p>
        </div>
      </div>
    </div>
  )
}
