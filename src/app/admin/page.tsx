import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils/slug'
import type { EventStatus } from '@/lib/types/database'
import { getActiveOrg } from '@/lib/utils/active-org'
import { cn, H1, SUBTITLE, BTN_PRIMARY, TAB_BAR, TAB_ACTIVE, TAB_INACTIVE, LIST_CARD, ERROR_BANNER } from '@/lib/styles'

// Next.js: re-render this page on every request (never cache stale event data)
export const dynamic = 'force-dynamic'

const STATUS_FILTERS = ['all', 'draft', 'published', 'archived'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

interface PageProps {
  searchParams: { status?: string }
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const supabase = createClient()

  // Get the authenticated user's active org
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const membership = user ? await getActiveOrg(supabase, user.id) : null

  const activeFilter: StatusFilter =
    STATUS_FILTERS.includes(searchParams.status as StatusFilter)
      ? (searchParams.status as StatusFilter)
      : 'all'

  let eventsQuery = supabase
    .from('events')
    .select('id, title, venue, start_date, end_date, status, slug')
    .is('deleted_at', null)
    .order('start_date', { ascending: false })

  if (membership) {
    eventsQuery = eventsQuery.eq('org_id', membership.org_id)
  }

  if (activeFilter !== 'all') {
    eventsQuery = eventsQuery.eq('status', activeFilter as EventStatus)
  }

  const { data: events, error: eventsError } = await eventsQuery

  if (eventsError) {
    Sentry.captureException(eventsError, {
      tags: { action: 'adminDashboard.listEvents' },
    })
  }

  const loadError = eventsError ? 'Could not load timetables. Please retry.' : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={H1}>Timetables</h1>
          <p className={SUBTITLE}>
            Manage your timetables.
          </p>
        </div>
        <Link
          href="/admin/events/new"
          className={`inline-flex items-center ${BTN_PRIMARY} whitespace-nowrap`}
        >
          + Create timetable
        </Link>
      </div>

      {loadError && (
        <div className={ERROR_BANNER} role="alert">{loadError}</div>
      )}

      {/* Status filter tabs */}
      <div className={TAB_BAR}>
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'all' ? '/admin' : `/admin?status=${f}`}
            className={cn(
              activeFilter === f ? TAB_ACTIVE : TAB_INACTIVE,
              'capitalize',
            )}
          >
            {f}
          </Link>
        ))}
      </div>

      {/* Events list */}
      {!events || events.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-base mb-2">No timetables found.</p>
          {activeFilter === 'all' ? (
            <Link
              href="/admin/events/new"
              className="text-sm text-gray-900 underline underline-offset-2 hover:text-gray-600"
            >
              Create your first timetable →
            </Link>
          ) : (
            <Link
              href="/admin"
              className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700"
            >
              Clear filter
            </Link>
          )}
        </div>
      ) : (
        <div className={LIST_CARD}>
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/admin/events/${event.id}`}
              className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-0.5">
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-gray-700">
                    {event.title}
                  </p>
                  <StatusBadge status={event.status} />
                </div>
                <p className="text-xs text-gray-400">
                  {event.venue ? `${event.venue} · ` : ''}
                  {formatDate(event.start_date)}
                  {event.end_date !== event.start_date && ` – ${formatDate(event.end_date)}`}
                </p>
              </div>
              <span className="text-gray-300 group-hover:text-gray-400 text-sm">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
