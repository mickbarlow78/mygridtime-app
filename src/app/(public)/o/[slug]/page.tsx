/**
 * Public organisation page — /o/[slug]
 *
 * Lists only published, non-deleted events for the organisation.
 *
 * Access rules (enforced here AND in Supabase RLS):
 *   - Only published events (status = 'published' AND deleted_at IS NULL).
 *   - Unknown org slug → 404.
 *   - No authentication required.
 *
 * Implementation notes:
 *   - The org row is resolved server-side via the admin client — anon users
 *     cannot SELECT from `organisations` under current RLS, and Pass B does
 *     not widen that policy. Mirrors the existing pattern on the public
 *     landing page (`(public)/page.tsx`) and the per-event page.
 *   - On any failure of the events list query, the error is captured to
 *     Sentry and the page degrades to the empty-state render.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { signOut } from '@/app/admin/actions'
import type { Metadata } from 'next'
import { formatDate } from '@/lib/utils/slug'
import type { OrgBranding } from '@/lib/types/database'
import {
  PAGE_BG,
  HEADER,
  HEADER_INNER,
  CONTAINER_FULL,
  AUTH_EMAIL,
  AUTH_LINK,
} from '@/lib/styles'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { slug: string }
}

// ---------------------------------------------------------------------------
// Org resolver — admin client, server-only. Returns null on error or miss.
// ---------------------------------------------------------------------------

type PublicOrg = {
  id: string
  name: string
  slug: string
  branding: OrgBranding | null
}

async function resolveOrgBySlug(slug: string): Promise<PublicOrg | null> {
  try {
    const admin = createAdminClient()
    const { data: org, error } = await admin
      .from('organisations')
      .select('id, name, slug, branding')
      .eq('slug', slug)
      .maybeSingle()

    if (error) {
      Sentry.captureException(error, {
        tags: { action: 'publicOrgPage.resolveOrg' },
      })
      return null
    }
    if (!org) return null

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      branding: (org.branding ?? null) as OrgBranding | null,
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: 'publicOrgPage.resolveOrg' },
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// SEO metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const org = await resolveOrgBySlug(params.slug)
  if (!org) return { title: 'Organisation not found' }
  const branding = org.branding ?? null
  const displayName = branding?.headerText ?? org.name
  return {
    title: displayName,
    description: `Published timetables from ${displayName}.`,
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PublicOrgPage({ params }: PageProps) {
  const org = await resolveOrgBySlug(params.slug)
  if (!org) notFound()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Published, non-deleted events scoped to this org. Anon RLS on `events`
  // already enforces the same filter at the DB level — the explicit clauses
  // are defence in depth and also keep the result shape clear.
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, title, venue, start_date, end_date, slug')
    .eq('org_id', org.id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('start_date', { ascending: true })

  if (eventsError) {
    Sentry.captureException(eventsError, {
      tags: { action: 'publicOrgPage.listEvents' },
    })
  }

  // Degrade to empty state on list failure (matches the scope directive).
  const eventList = eventsError ? [] : (events ?? [])

  const branding = org.branding ?? null
  const displayName = branding?.headerText ?? org.name

  return (
    <div className={PAGE_BG}>
      {/* Header — white strip, matches public landing */}
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
                Published timetables from this organisation.
              </p>
            </div>
          </div>
          {user ? (
            <div className="flex items-center gap-4 shrink-0">
              <span className={AUTH_EMAIL}>{user.email}</span>
              <form action={signOut}>
                <button type="submit" className={AUTH_LINK}>
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link href="/auth/login" className={`shrink-0 ${AUTH_LINK}`}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Page body */}
      <div className={`${CONTAINER_FULL} py-6`}>
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
                  <th className="py-2.5 pr-6 pl-4 font-semibold text-gray-700 whitespace-nowrap">Event</th>
                  <th className="py-2.5 pr-6 font-semibold text-gray-700 whitespace-nowrap">Venue</th>
                  <th className="py-2.5 pr-6 font-semibold text-gray-700 whitespace-nowrap">Start</th>
                  <th className="py-2.5 pr-6 font-semibold text-gray-700 whitespace-nowrap">End</th>
                  <th className="py-2.5 pr-4 font-semibold text-gray-700 whitespace-nowrap sr-only">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {eventList.map((event) => {
                  const sameDay = event.start_date === event.end_date
                  return (
                    <tr key={event.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="py-3.5 pr-6 pl-4">
                        <Link
                          href={`/${event.slug}`}
                          className="font-medium text-gray-900 group-hover:text-gray-600 hover:underline"
                        >
                          {event.title}
                        </Link>
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
                          href={`/${event.slug}`}
                          className="text-gray-300 group-hover:text-gray-400 transition-colors"
                          aria-hidden="true"
                          tabIndex={-1}
                        >
                          →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
