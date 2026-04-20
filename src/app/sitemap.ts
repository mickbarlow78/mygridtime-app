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

    // MGT-082: canonical event URL is `/{orgSlug}/{eventSlug}`. Event rows
    // alone don't carry the org slug under anon RLS, so resolve it via the
    // admin client. Events whose org slug can't be resolved are omitted
    // from the sitemap (they'd 404 or produce an ambiguous legacy
    // redirect).
    let eventRoutes: MetadataRoute.Sitemap = []
    let orgRoutes: MetadataRoute.Sitemap = []
    const distinctOrgIds = Array.from(new Set(eventList.map((e) => e.org_id)))
    if (distinctOrgIds.length > 0) {
      try {
        const admin = createAdminClient()
        const { data: orgs } = await admin
          .from('organisations')
          .select('id, slug')
          .in('id', distinctOrgIds)
        const orgSlugById = new Map<string, string>((orgs ?? []).map((o) => [o.id, o.slug]))

        eventRoutes = eventList.flatMap((event) => {
          const orgSlug = orgSlugById.get(event.org_id)
          if (!orgSlug) return []
          return [{
            url: `${baseUrl}/${orgSlug}/${event.slug}`,
            lastModified: event.updated_at ? new Date(event.updated_at) : new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
          }]
        })

        orgRoutes = (orgs ?? []).map((org) => ({
          url: `${baseUrl}/${org.slug}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.6,
        }))
      } catch {
        // Admin client unavailable — omit event + org routes, keep static.
      }
    }

    return [...staticRoutes, ...eventRoutes, ...orgRoutes]
  } catch {
    return staticRoutes
  }
}
