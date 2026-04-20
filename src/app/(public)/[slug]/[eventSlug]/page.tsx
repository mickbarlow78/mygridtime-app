/**
 * Public event timetable — /[orgSlug]/[eventSlug]
 *
 * MGT-082: canonical public URL for an event. The first segment is the
 * owning organisation's slug; the second is the event's slug (now unique
 * only within the org, per the `events_org_id_slug_key` composite
 * constraint).
 *
 * Resolution order:
 *   1. Resolve the organisation by slug. If none, notFound().
 *   2. Fetch the published event by `(org_id, slug)`. If none, notFound().
 *   3. Render the timetable exactly as the previous top-level `/{slug}`
 *      event page did.
 *
 * Access rules (enforced here AND in Supabase RLS):
 *   - Only published, non-deleted events are accessible.
 *   - Draft / archived events → 404.
 *   - No authentication required.
 *
 * Day selection: same semantics as before — `?day=YYYY-MM-DD`, today, or
 * first day fallback; single-day events show no tabs.
 *
 * Legacy top-level event URLs (`/{eventSlug}`) are preserved via a 308
 * redirect in `../page.tsx`.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/admin/actions'
import type { Metadata } from 'next'
import { TimetableDay } from '@/components/public/TimetableDay'
import type { PublicEntry } from '@/components/public/TimetableDay'
import { formatDate } from '@/lib/utils/slug'
import { resolveEffectiveBranding } from '@/lib/utils/branding'
import { resolvePublicOrgBySlug } from '@/lib/utils/public-org'
import type { Json } from '@/lib/types/database'
import {
  cn,
  PAGE_BG,
  HEADER,
  HEADER_INNER,
  CONTAINER_FULL,
  H1_PUBLIC,
  AUTH_EMAIL,
  AUTH_LINK,
} from '@/lib/styles'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { slug: string; eventSlug: string }
  searchParams: { day?: string }
}

// ---------------------------------------------------------------------------
// SEO metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const org = await resolvePublicOrgBySlug(params.slug)
  if (!org) return { title: 'Page not found' }

  const supabase = createClient()
  const { data: event } = await supabase
    .from('events')
    .select('title, venue, start_date, end_date')
    .eq('org_id', org.id)
    .eq('slug', params.eventSlug)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  if (!event) return { title: 'Page not found' }

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

export default async function PublicEventPage({ params, searchParams }: PageProps) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const org = await resolvePublicOrgBySlug(params.slug)
  if (!org) notFound()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, venue, start_date, end_date, slug, org_id, branding')
    .eq('org_id', org.id)
    .eq('slug', params.eventSlug)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  if (!event) notFound()

  // Fetch org branding via admin client (anon users cannot read organisations).
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
    // Admin client unavailable — fall back to event-level branding only.
  }

  const branding = resolveEffectiveBranding(event.branding, orgBranding)

  const { data: days } = await supabase
    .from('event_days')
    .select('id, date, label, sort_order')
    .eq('event_id', event.id)
    .order('sort_order', { ascending: true })
    .order('date', { ascending: true })

  const dayList = days ?? []

  const today = new Date().toISOString().split('T')[0]
  const requestedDate = searchParams.day
  const activeDay = requestedDate
    ? (dayList.find((d) => d.date === requestedDate) ?? dayList[0])
    : (dayList.find((d) => d.date === today) ?? dayList[0])

  let entries: PublicEntry[] = []
  if (activeDay) {
    const { data } = await supabase
      .from('timetable_entries')
      .select('id, title, start_time, end_time, category, notes, is_break, sort_order')
      .eq('event_day_id', activeDay.id)
      .order('sort_order', { ascending: true })
    entries = (data ?? []) as PublicEntry[]
  }

  const dateRange =
    event.start_date === event.end_date
      ? formatDate(event.start_date)
      : `${formatDate(event.start_date)} – ${formatDate(event.end_date)}`

  const basePath = `/${params.slug}/${params.eventSlug}`

  return (
    <div className={PAGE_BG}>
      <div className={HEADER}>
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
            <Link
              href={`${basePath}/print`}
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
                  <button type="submit" className={AUTH_LINK}>
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link href="/auth/login" className={AUTH_LINK}>
                Sign in
              </Link>
            )}
          </div>
        </div>
        <div className={`${CONTAINER_FULL} pt-3 pb-4`}>
          <h1 className={H1_PUBLIC}>{event.title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {event.venue && <span>{event.venue} · </span>}
            <span>{dateRange}</span>
          </p>
        </div>
      </div>

      {dayList.length > 1 && (
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
          <div className={CONTAINER_FULL}>
            <div className="flex overflow-x-auto gap-0 -mb-px">
              {dayList.map((day) => {
                const isActive = day.id === activeDay?.id
                const label = day.label || formatDate(day.date)
                return (
                  <Link
                    key={day.id}
                    href={`${basePath}?day=${day.date}`}
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

      <div className={`${CONTAINER_FULL} py-5`}>
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
