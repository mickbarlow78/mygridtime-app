/**
 * Legacy print route — /[slug]/print
 *
 * MGT-082 (supersedes DEC-022): the canonical print URL is now
 * `/[orgSlug]/[eventSlug]/print` (see `../[eventSlug]/print/page.tsx`).
 * This route is preserved so previously shared `/{eventSlug}/print` URLs
 * continue to resolve.
 *
 * Behaviour:
 *   - Look up published events where `slug = params.slug`.
 *   - If exactly one matches, 308 to `/{orgSlug}/{eventSlug}/print`.
 *   - Otherwise 404 (ambiguous or no match under per-org uniqueness).
 *
 * Static segment `print` wins precedence over the sibling
 * `/[slug]/[eventSlug]` dynamic segment, so this route is safely
 * reachable for legacy URLs.
 */

import { notFound, permanentRedirect } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { slug: string }
}

async function resolveLegacyEventPrintPath(slug: string): Promise<string | null> {
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
      Sentry.captureException(error, {
        tags: { action: 'legacyPrint.resolveEvent' },
      })
      return null
    }
    if (!events || events.length !== 1) return null

    const row = events[0] as {
      slug: string
      organisations: { slug: string } | { slug: string }[]
    }
    const orgSlug = Array.isArray(row.organisations)
      ? row.organisations[0]?.slug
      : row.organisations?.slug
    if (!orgSlug) return null
    return `/${orgSlug}/${row.slug}/print`
  } catch (err) {
    Sentry.captureException(err, { tags: { action: 'legacyPrint.resolveEvent' } })
    return null
  }
}

export default async function LegacyPrintPage({ params }: PageProps) {
  const canonical = await resolveLegacyEventPrintPath(params.slug)
  if (canonical) permanentRedirect(canonical)
  notFound()
}
