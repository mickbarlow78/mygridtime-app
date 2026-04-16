/**
 * Server-side helpers for resolving the public organisation page.
 *
 * The org row is loaded via the admin Supabase client because anon users do
 * not have SELECT access on `organisations` under current RLS (Pass C1 does
 * not widen that policy). Matches the existing pattern on the public landing
 * and per-event pages.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import * as Sentry from '@sentry/nextjs'
import type { OrgBranding } from '@/lib/types/database'
import type { PublicOrg } from '@/components/public/PublicOrgView'

export async function resolvePublicOrgBySlug(slug: string): Promise<PublicOrg | null> {
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
