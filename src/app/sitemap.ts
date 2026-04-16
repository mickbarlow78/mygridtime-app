import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerAppUrl } from '@/lib/utils/app-url'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getServerAppUrl()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ]

  // Fetch published event slugs
  try {
    const supabase = createClient()
    const { data: events } = await supabase
      .from('events')
      .select('slug, updated_at, org_id')
      .eq('status', 'published')
      .is('deleted_at', null)

    const eventList = events ?? []

    const eventRoutes: MetadataRoute.Sitemap = eventList.map((event) => ({
      url: `${baseUrl}/${event.slug}`,
      lastModified: event.updated_at ? new Date(event.updated_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))

    // Include /{orgSlug} only for orgs with at least one published event.
    // Anon RLS does not grant SELECT on `organisations`, so this lookup
    // must go through the admin client (same pattern as the public pages).
    // Per Pass C1 the public organisation page lives at `/{orgSlug}`, so
    // the sitemap emits the bare slug here — the legacy `/o/{slug}` route
    // 308-redirects to the same location and is intentionally NOT listed.
    let orgRoutes: MetadataRoute.Sitemap = []
    const distinctOrgIds = Array.from(new Set(eventList.map((e) => e.org_id)))
    if (distinctOrgIds.length > 0) {
      try {
        const admin = createAdminClient()
        const { data: orgs } = await admin
          .from('organisations')
          .select('slug')
          .in('id', distinctOrgIds)
        orgRoutes = (orgs ?? []).map((org) => ({
          url: `${baseUrl}/${org.slug}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.6,
        }))
      } catch {
        // Admin client unavailable — omit org routes, keep event routes.
      }
    }

    return [...staticRoutes, ...eventRoutes, ...orgRoutes]
  } catch {
    return staticRoutes
  }
}
