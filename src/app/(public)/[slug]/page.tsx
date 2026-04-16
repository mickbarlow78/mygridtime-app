/**
 * Public top-level slug page — /[slug]
 *
 * Resolution order:
 *   1. Try to resolve as a published event → render event timetable.
 *   2. Otherwise try to resolve as an organisation → render public org page.
 *   3. Otherwise notFound().
 *
 * Per Pass C1, organisation public pages live at `/{orgSlug}` and share the
 * top-level namespace with per-event public pages (`/{eventSlug}`). Reserved
 * top-level slugs (`/admin`, `/api`, `/o`, …) are blocked at organisation
 * creation (`isReservedSlug`); event slug uniqueness vs org slugs is enforced
 * at org creation but is NOT yet enforced at event creation in Pass C1.
 *
 * Event access rules (enforced here AND in Supabase RLS):
 *   - Only published events are accessible.
 *   - Draft events → fall through to org / 404.
 *   - Archived events → fall through to org / 404.
 *   - No authentication required.
 *
 * Day selection (event branch only):
 *   - Passed via ?day=YYYY-MM-DD search param (ISO date string).
 *   - If the event is running today, today's date is pre-selected.
 *   - Falls back to the first day if the param is absent or invalid.
 *   - Single-day events show no tabs.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { signOut } from '@/app/admin/actions'
import type { Metadata } from 'next'
import { TimetableDay } from '@/components/public/TimetableDay'
import type { PublicEntry } from '@/components/public/TimetableDay'
import { PublicOrgView } from '@/components/public/PublicOrgView'
import type { PublicOrgEvent } from '@/components/public/PublicOrgView'
import { formatDate } from '@/lib/utils/slug'
import { resolveEffectiveBranding } from '@/lib/utils/branding'
import { resolvePublicOrgBySlug } from '@/lib/utils/public-org'
import type { Json } from '@/lib/types/database'
import { cn, PAGE_BG, HEADER, HEADER_INNER, CONTAINER_FULL, H1_PUBLIC, AUTH_EMAIL, AUTH_LINK } from '@/lib/styles'

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

  if (event) {
    const dateStr =
      event.start_date === event.end_date
        ? formatDate(event.start_date)
        : `${formatDate(event.start_date)} – ${formatDate(event.end_date)}`

    return {
      title: event.title,
      description: [event.venue, dateStr].filter(Boolean).join(' · '),
    }
  }

  // Fall through to organisation metadata if the slug matches an org.
  const org = await resolvePublicOrgBySlug(params.slug)
  if (org) {
    const displayName = org.branding?.headerText ?? org.name
    return {
      title: displayName,
      description: `Published timetables from ${displayName}.`,
    }
  }

  return { title: 'Page not found' }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PublicTimetablePage({ params, searchParams }: PageProps) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch the event — published only, explicit select (no admin fields).
  // Include org_id and branding so we can resolve effective branding below.
  const { data: event } = await supabase
    .from('events')
    .select('id, title, venue, start_date, end_date, slug, org_id, branding')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  // Slug did not match a published event — try to resolve as an organisation.
  if (!event) {
    const org = await resolvePublicOrgBySlug(params.slug)
    if (!org) notFound()

    // Published, non-deleted events scoped to this org. Anon RLS on `events`
    // already enforces the same filter at the DB level — the explicit clauses
    // are defence in depth and also keep the result shape clear.
    const { data: orgEvents, error: orgEventsError } = await supabase
      .from('events')
      .select('id, title, venue, start_date, end_date, slug')
      .eq('org_id', org.id)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('start_date', { ascending: true })

    if (orgEventsError) {
      Sentry.captureException(orgEventsError, {
        tags: { action: 'publicOrgPage.listEvents' },
      })
    }

    const eventList: PublicOrgEvent[] = orgEventsError ? [] : ((orgEvents ?? []) as PublicOrgEvent[])

    return <PublicOrgView org={org} events={eventList} user={user} />
  }

  // Fetch org branding via admin client (anon users cannot read organisations).
  // Wrapped in try/catch so a missing service-role key degrades gracefully.
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
    <div className={PAGE_BG}>
      {/* ── Event header ── */}
      <div className={HEADER}>
        {/* Top bar: branding left, actions right — mirrors public root header */}
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
          <div className="flex items-center gap-4 shrink-0">
            {/* Print link — opens print page in new tab */}
            <Link
              href={`/${params.slug}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2.5 py-1.5 hover:border-gray-300 transition-colors whitespace-nowrap"
            >
              Print
            </Link>
            {user ? (
              <>
                <span className={AUTH_EMAIL}>{user.email}</span>
                <form action={signOut}>
                  <button
                    type="submit"
                    className={AUTH_LINK}
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/auth/login"
                className={AUTH_LINK}
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
        {/* Event title + subtitle */}
        <div className={`${CONTAINER_FULL} pt-3 pb-4`}>
          <h1 className={H1_PUBLIC}>
            {event.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {event.venue && <span>{event.venue} · </span>}
            <span>{dateRange}</span>
          </p>
        </div>
      </div>

      {/* ── Day tabs — only for multi-day events ── */}
      {dayList.length > 1 && (
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
          <div className={CONTAINER_FULL}>
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
      <div className={`${CONTAINER_FULL} py-5`}>
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
