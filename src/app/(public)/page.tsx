/**
 * Public landing page — lists all currently published events.
 *
 * Access rules:
 *   - Only events with status = 'published' AND deleted_at IS NULL are returned.
 *   - No authentication required.
 *   - Supabase RLS enforces the same rule at the database level.
 *
 * Org context:
 *   - Resolved from the first published event's org_id via admin client.
 *   - Falls back to "MyGridTime" if no events or admin client unavailable.
 *   - Org branding headerText takes precedence over org name for display.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/slug'
import { signOut } from '@/app/admin/actions'
import type { Metadata } from 'next'
import type { ChampionshipBranding } from '@/lib/types/database'
import { PAGE_BG, HEADER, HEADER_INNER, CONTAINER_FULL, AUTH_EMAIL, AUTH_LINK } from '@/lib/styles'

type OrgInfo = { name: string; slug: string; branding: ChampionshipBranding | null }

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Org resolver — lightweight fetch for metadata (single org name).
// ---------------------------------------------------------------------------

async function resolvePublicOrgName(): Promise<string | null> {
  try {
    const supabase = createClient()
    const { data: firstEvent } = await supabase
      .from('events')
      .select('org_id')
      .eq('status', 'published')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!firstEvent) return null

    const admin = createAdminClient()
    const { data: org } = await admin
      .from('organisations')
      .select('name')
      .eq('id', firstEvent.org_id)
      .maybeSingle()

    return org?.name ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// SEO metadata
// ---------------------------------------------------------------------------

export async function generateMetadata(): Promise<Metadata> {
  const name = await resolvePublicOrgName()
  return {
    title: name ?? 'MyGridTime',
    description: 'Race-day timetables for motorsport events.',
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function LandingPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: events } = await supabase
    .from('events')
    .select('id, title, venue, start_date, end_date, slug, org_id')
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('start_date', { ascending: true })

  const eventList = events ?? []

  // Batch-fetch org names for all listed events (single query, no N+1).
  const orgMap = new Map<string, OrgInfo>()
  const distinctOrgIds = Array.from(new Set(eventList.map((e) => e.org_id)))
  if (distinctOrgIds.length > 0) {
    try {
      const admin = createAdminClient()
      const { data: orgs } = await admin
        .from('organisations')
        .select('id, name, slug, branding')
        .in('id', distinctOrgIds)
      for (const o of orgs ?? []) {
        orgMap.set(o.id, {
          name: o.name,
          slug: o.slug,
          branding: (o.branding ?? null) as ChampionshipBranding | null,
        })
      }
    } catch {
      // Graceful degradation — org names will be absent.
    }
  }

  // Apply org branding to page header only when every event belongs to one org.
  const singleOrg = distinctOrgIds.length === 1 ? orgMap.get(distinctOrgIds[0]) : null
  const branding = singleOrg?.branding ?? null
  const displayName = (singleOrg ? (branding?.headerText ?? singleOrg.name) : null) ?? 'MyGridTime'

  return (
    <div className={PAGE_BG}>
      {/* Header — white strip, matches admin */}
      <header className={HEADER}>
        <div className={HEADER_INNER}>
          <div className="flex items-center gap-3 min-w-0">
            {branding?.logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={branding.logoUrl}
                alt={displayName}
                className="h-8 w-auto object-contain shrink-0"
              />
            )}
            <div className="min-w-0">
              <h1
                className="text-2xl font-semibold tracking-tight truncate"
                style={{ color: branding?.primaryColor ?? undefined }}
              >
                {displayName}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Race-day timetables for motorsport events.
              </p>
            </div>
          </div>
          {user ? (
            <div className="flex items-center gap-4 shrink-0">
              <span className={AUTH_EMAIL}>{user.email}</span>
              <form action={signOut}>
                <button
                  type="submit"
                  className={AUTH_LINK}
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/auth/login"
              className={`shrink-0 ${AUTH_LINK}`}
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Page body — grey background */}
      <div className={`${CONTAINER_FULL} py-6`}>
        {/* Events table */}
        {eventList.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No timetables have been published yet.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr
                  className="border-t border-b border-gray-200 text-left"
                  style={{ borderTopColor: branding?.primaryColor ?? undefined }}
                >
                  <th className="py-2.5 pr-6 pl-4 font-semibold text-gray-700 whitespace-nowrap">Timetable</th>
                  <th className="py-2.5 pr-6 font-semibold text-gray-700 whitespace-nowrap">Championship</th>
                  <th className="py-2.5 pr-6 font-semibold text-gray-700 whitespace-nowrap">Venue</th>
                  <th className="py-2.5 pr-6 font-semibold text-gray-700 whitespace-nowrap">Start</th>
                  <th className="py-2.5 pr-6 font-semibold text-gray-700 whitespace-nowrap">End</th>
                  <th className="py-2.5 pr-4 font-semibold text-gray-700 whitespace-nowrap sr-only">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {eventList.flatMap((event) => {
                  // MGT-082: event URL requires the owning org's slug. If the
                  // admin fetch failed and the org slug is unknown, omit the
                  // row rather than render a broken link.
                  const orgInfo = orgMap.get(event.org_id)
                  if (!orgInfo) return []
                  const orgName = orgInfo.name
                  const eventHref = `/${orgInfo.slug}/${event.slug}`
                  const sameDay = event.start_date === event.end_date

                  return [(
                    <tr key={event.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="py-3.5 pr-6 pl-4">
                        <Link
                          href={eventHref}
                          className="font-medium text-gray-900 group-hover:text-gray-600 hover:underline"
                        >
                          {event.title}
                        </Link>
                      </td>
                      <td className="py-3.5 pr-6 text-gray-500 whitespace-nowrap">
                        {orgName ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3.5 pr-6 text-gray-500 whitespace-nowrap">
                        {event.venue ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3.5 pr-6 text-gray-500 whitespace-nowrap tabular-nums">
                        {formatDate(event.start_date)}
                      </td>
                      <td className="py-3.5 pr-6 text-gray-500 whitespace-nowrap tabular-nums">
                        {sameDay ? <span className="text-gray-300">—</span> : formatDate(event.end_date)}
                      </td>
                      <td className="py-3.5 pr-4 text-right">
                        <Link
                          href={eventHref}
                          className="text-gray-300 group-hover:text-gray-400 transition-colors"
                          aria-hidden="true"
                          tabIndex={-1}
                        >
                          →
                        </Link>
                      </td>
                    </tr>
                  )]
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
