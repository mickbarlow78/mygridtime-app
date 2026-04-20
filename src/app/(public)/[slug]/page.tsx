/**
 * Public top-level slug page — /[slug]
 *
 * MGT-082 (supersedes DEC-022): per-org event slug uniqueness moved the
 * canonical public event URL to `/[orgSlug]/[eventSlug]` (see
 * `./[eventSlug]/page.tsx`). This top-level route now serves two purposes:
 *
 *   1. Render the public organisation page when the slug resolves to an org.
 *   2. Preserve legacy `/{eventSlug}` URLs (shared links, printed
 *      collateral, bookmarks) with a 308 permanent redirect to the new
 *      canonical `/{orgSlug}/{eventSlug}` URL, IFF exactly one published
 *      event in the system still uses that slug. If multiple events share
 *      the slug (now possible under per-org uniqueness) the redirect would
 *      be ambiguous, so we 404 instead.
 *
 * Reserved top-level slugs (`/admin`, `/api`, `/o`, …) remain blocked at
 * organisation creation via `isReservedSlug`.
 *
 * Access rules (org branch):
 *   - Lists published, non-deleted events for the org.
 *   - No authentication required.
 */

import { createClient } from '@/lib/supabase/server'
import { notFound, permanentRedirect } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import type { Metadata } from 'next'
import { PublicOrgView } from '@/components/public/PublicOrgView'
import type { PublicOrgEvent } from '@/components/public/PublicOrgView'
import { resolvePublicOrgBySlug } from '@/lib/utils/public-org'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { slug: string }
}

// ---------------------------------------------------------------------------
// Legacy-event resolver
// ---------------------------------------------------------------------------

/**
 * Returns the canonical `/orgSlug/eventSlug` path for a legacy top-level
 * event slug, or `null` if the slug does not uniquely identify a published
 * event. Uses the admin client so we can read `organisations.slug` (anon
 * RLS does not expose it).
 */
async function resolveLegacyEventPath(slug: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data: events, error } = await admin
      .from('events')
      .select('slug, organisations!inner(slug)')
      .eq('slug', slug)
      .eq('status', 'published')
      .is('deleted_at', null)
      .limit(2)

    if (error) {
      Sentry.captureException(error, { tags: { action: 'legacySlug.resolveEvent' } })
      return null
    }
    if (!events || events.length !== 1) return null

    const row = events[0] as { slug: string; organisations: { slug: string } | { slug: string }[] }
    const orgSlug = Array.isArray(row.organisations)
      ? row.organisations[0]?.slug
      : row.organisations?.slug
    if (!orgSlug) return null
    return `/${orgSlug}/${row.slug}`
  } catch (err) {
    Sentry.captureException(err, { tags: { action: 'legacySlug.resolveEvent' } })
    return null
  }
}

// ---------------------------------------------------------------------------
// SEO metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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

export default async function PublicSlugPage({ params }: PageProps) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 1. Try org first.
  const org = await resolvePublicOrgBySlug(params.slug)
  if (org) {
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

    const eventList: PublicOrgEvent[] = orgEventsError
      ? []
      : ((orgEvents ?? []) as PublicOrgEvent[])

    return <PublicOrgView org={org} events={eventList} user={user} />
  }

  // 2. Legacy top-level event slug — redirect to canonical nested URL if
  //    exactly one published event still matches.
  const canonical = await resolveLegacyEventPath(params.slug)
  if (canonical) permanentRedirect(canonical)

  notFound()
}
