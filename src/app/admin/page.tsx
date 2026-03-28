import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils/slug'
import type { EventStatus } from '@/lib/types/database'

// Next.js: re-render this page on every request (never cache stale event data)
export const dynamic = 'force-dynamic'

const STATUS_FILTERS = ['all', 'draft', 'published', 'archived'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

interface PageProps {
  searchParams: { status?: string }
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const supabase = createClient()

  // Get the authenticated user's org
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user!.id)
    .limit(1)
    .single()

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

  const { data: events } = await eventsQuery

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Events</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage your race event timetables.
          </p>
        </div>
        <Link
          href="/admin/events/new"
          className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors whitespace-nowrap"
        >
          + Create event
        </Link>
      </div>

      {/* No org warning */}
      {!membership && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          Your account is not linked to an organisation yet. Ask an administrator to add you via the Supabase dashboard.
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-gray-200 -mb-px">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'all' ? '/admin' : `/admin?status=${f}`}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
              activeFilter === f
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {f}
          </Link>
        ))}
      </div>

      {/* Events list */}
      {!events || events.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-base mb-2">No events found.</p>
          {activeFilter === 'all' ? (
            <Link
              href="/admin/events/new"
              className="text-sm text-gray-900 underline underline-offset-2 hover:text-gray-600"
            >
              Create your first event →
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
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
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
