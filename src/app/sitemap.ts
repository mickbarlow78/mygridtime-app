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
      .select('slug, updated_at, championship_id')
      .eq('status', 'published')
      .is('deleted_at', null)

    const eventList = events ?? []

    // MGT-082: canonical event URL is `/{championshipSlug}/{eventSlug}`. Event rows
    // alone don't carry the championship slug under anon RLS, so resolve it via the
    // admin client. Events whose championship slug can't be resolved are omitted
    // from the sitemap (they'd 404 or produce an ambiguous legacy
    // redirect).
    let eventRoutes: MetadataRoute.Sitemap = []
    let championshipRoutes: MetadataRoute.Sitemap = []
    const distinctChampionshipIds = Array.from(new Set(eventList.map((e) => e.championship_id)))
    if (distinctChampionshipIds.length > 0) {
      try {
        const admin = createAdminClient()
        const { data: championships } = await admin
          .from('championships')
          .select('id, slug')
          .in('id', distinctChampionshipIds)
        const championshipSlugById = new Map<string, string>((championships ?? []).map((c) => [c.id, c.slug]))

        eventRoutes = eventList.flatMap((event) => {
          const championshipSlug = championshipSlugById.get(event.championship_id)
          if (!championshipSlug) return []
          return [{
            url: `${baseUrl}/${championshipSlug}/${event.slug}`,
            lastModified: event.updated_at ? new Date(event.updated_at) : new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
          }]
        })

        championshipRoutes = (championships ?? []).map((championship) => ({
          url: `${baseUrl}/${championship.slug}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.6,
        }))
      } catch {
        // Admin client unavailable — omit event + org routes, keep static.
      }
    }

    return [...staticRoutes, ...eventRoutes, ...championshipRoutes]
  } catch {
    return staticRoutes
  }
}
