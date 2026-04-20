import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/slug'
import { H1, LIST_CARD } from '@/lib/styles'

export const dynamic = 'force-dynamic'

export default async function MyTimetablesPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null // layout handles redirect

  // Fetch all org memberships for this user. MGT-084: orgless subscribers/
  // members reach /my too — they simply see the empty-state below.
  const { data: memberships } = await supabase
    .from('org_members')
    .select('org_id, organisations(name)')
    .eq('user_id', user.id)

  const orgIds = (memberships ?? []).map((m) => m.org_id)

  // Build a lookup of org_id → org name
  const orgNames = new Map<string, string>()
  for (const m of memberships ?? []) {
    const org = m.organisations as unknown as { name: string } | null
    orgNames.set(m.org_id, org?.name ?? '')
  }

  // Fetch published events for all user's orgs. Skip the query entirely for
  // orgless users — an empty `.in()` list returns zero rows but still wastes
  // a round-trip.
  let eventList: Array<{
    id: string
    title: string
    venue: string | null
    start_date: string
    end_date: string
    org_id: string
    slug: string
  }> = []
  if (orgIds.length > 0) {
    const { data: events } = await supabase
      .from('events')
      .select('id, title, venue, start_date, end_date, org_id, slug')
      .in('org_id', orgIds)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('start_date', { ascending: false })

    eventList = events ?? []
  }

  return (
    <div>
      <h1 className={H1}>My Timetables</h1>

      {eventList.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">
          No timetables have been published yet.
        </div>
      ) : (
        <div className={`${LIST_CARD} mt-4`}>
          {eventList.map((event) => {
            const dateRange =
              event.start_date === event.end_date
                ? formatDate(event.start_date)
                : `${formatDate(event.start_date)} – ${formatDate(event.end_date)}`

            return (
              <Link
                key={event.id}
                href={`/my/${event.id}`}
                className="block px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">{event.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {event.venue && <span>{event.venue} · </span>}
                  <span>{dateRange}</span>
                  {orgNames.get(event.org_id) && (
                    <span className="text-gray-400"> · {orgNames.get(event.org_id)}</span>
                  )}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
