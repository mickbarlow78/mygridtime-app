import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { resolveEffectiveBranding } from '@/lib/utils/branding'
import { TimetableDay } from '@/components/public/TimetableDay'
import type { PublicEntry } from '@/components/public/TimetableDay'
import { formatDate } from '@/lib/utils/slug'
import type { Json } from '@/lib/types/database'
import { cn, HEADER, HEADER_INNER, CONTAINER_FULL, H1_PUBLIC, HEADER_NAV_LINK } from '@/lib/styles'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { timetableId: string }
  searchParams: { day?: string }
}

export default async function ConsumerTimetablePage({ params, searchParams }: PageProps) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null // layout handles redirect

  // Fetch the event — published only
  const { data: event } = await supabase
    .from('events')
    .select('id, title, venue, start_date, end_date, slug, org_id, branding')
    .eq('id', params.timetableId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  if (!event) notFound()

  // Verify user is a member of this event's org
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('org_id', event.org_id)
    .maybeSingle()

  if (!membership) notFound()

  // Fetch org branding via admin client (RLS may block anon read on organisations)
  let orgBranding: Json | null = null
  try {
    const admin = createAdminClient()
    const { data: orgRow } = await admin
      .from('organisations')
      .select('branding')
      .eq('id', event.org_id)
      .maybeSingle()
    orgBranding = orgRow?.branding ?? null
  } catch {
    // Admin client unavailable — fall back to event-level branding only
  }

  const branding = resolveEffectiveBranding(event.branding, orgBranding)

  // Fetch event days, sorted
  const { data: days } = await supabase
    .from('event_days')
    .select('id, date, label, sort_order')
    .eq('event_id', event.id)
    .order('sort_order', { ascending: true })
    .order('date', { ascending: true })

  const dayList = days ?? []

  // Determine active day
  const today = new Date().toISOString().split('T')[0]
  const requestedDate = searchParams.day
  const activeDay = requestedDate
    ? (dayList.find((d) => d.date === requestedDate) ?? dayList[0])
    : (dayList.find((d) => d.date === today) ?? dayList[0])

  // Fetch entries for the active day
  let entries: PublicEntry[] = []
  if (activeDay) {
    const { data } = await supabase
      .from('timetable_entries')
      .select('id, title, start_time, end_time, category, notes, is_break, sort_order')
      .eq('event_day_id', activeDay.id)
      .order('sort_order', { ascending: true })
    entries = (data ?? []) as PublicEntry[]
  }

  // Date range for header
  const dateRange =
    event.start_date === event.end_date
      ? formatDate(event.start_date)
      : `${formatDate(event.start_date)} – ${formatDate(event.end_date)}`

  return (
    <div>
      {/* ── Event header with branding ── */}
      <div className={`${HEADER} -mx-4 sm:-mx-6 -mt-6`}>
        {branding.logoUrl || branding.headerText ? (
          <div className={HEADER_INNER}>
            <div className="flex items-center gap-3 min-w-0">
              {branding.logoUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={branding.logoUrl}
                  alt={branding.headerText ?? ''}
                  className="h-8 w-auto object-contain shrink-0"
                />
              )}
              {branding.headerText && (
                <span className="text-sm font-semibold text-gray-700 tracking-tight truncate">
                  {branding.headerText}
                </span>
              )}
            </div>
            <Link
              href={`/${event.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className={HEADER_NAV_LINK}
            >
              View public page
            </Link>
          </div>
        ) : (
          <div className={HEADER_INNER}>
            <div />
            <Link
              href={`/${event.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className={HEADER_NAV_LINK}
            >
              View public page
            </Link>
          </div>
        )}

        {/* Event title + subtitle */}
        <div className={`${CONTAINER_FULL} pt-3 pb-4`}>
          <h1 className={H1_PUBLIC}>{event.title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {event.venue && <span>{event.venue} · </span>}
            <span>{dateRange}</span>
          </p>
        </div>
      </div>

      {/* ── Day tabs — only for multi-day events ── */}
      {dayList.length > 1 && (
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm -mx-4 sm:-mx-6">
          <div className={CONTAINER_FULL}>
            <div className="flex overflow-x-auto gap-0 -mb-px">
              {dayList.map((day) => {
                const isActive = day.id === activeDay?.id
                const label = day.label || formatDate(day.date)
                return (
                  <Link
                    key={day.id}
                    href={`/my/${event.id}?day=${day.date}`}
                    className={cn(
                      'shrink-0 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                      isActive
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                    )}
                    style={
                      isActive && branding.primaryColor
                        ? { borderColor: branding.primaryColor, color: branding.primaryColor }
                        : undefined
                    }
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
      <div className="py-5">
        {dayList.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No timetable has been published yet.
          </div>
        ) : (
          <>
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
