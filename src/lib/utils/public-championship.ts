/**
 * Server-side helpers for resolving the public championship page.
 *
 * The championship row is loaded via the admin Supabase client because anon
 * users do not have SELECT access on `championships` under current RLS (Pass
 * C1 does not widen that policy). Matches the existing pattern on the public
 * landing and per-event pages.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import * as Sentry from '@sentry/nextjs'
import type { ChampionshipBranding } from '@/lib/types/database'
import type { PublicChampionship } from '@/components/public/PublicChampionshipView'

export async function resolvePublicChampionshipBySlug(slug: string): Promise<PublicChampionship | null> {
  try {
    const admin = createAdminClient()
    const { data: championship, error } = await admin
      .from('championships')
      .select('id, name, slug, branding')
      .eq('slug', slug)
      .maybeSingle()

    if (error) {
      Sentry.captureException(error, {
        tags: { action: 'publicChampionshipPage.resolveChampionship' },
      })
      return null
    }
    if (!championship) return null

    return {
      id: championship.id,
      name: championship.name,
      slug: championship.slug,
      branding: (championship.branding ?? null) as ChampionshipBranding | null,
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: 'publicChampionshipPage.resolveChampionship' },
    })
    return null
  }
}
