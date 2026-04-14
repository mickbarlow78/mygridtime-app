import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
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
      .select('slug, updated_at')
      .eq('status', 'published')
      .is('deleted_at', null)

    const eventRoutes: MetadataRoute.Sitemap = (events ?? []).map((event) => ({
      url: `${baseUrl}/${event.slug}`,
      lastModified: event.updated_at ? new Date(event.updated_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))

    return [...staticRoutes, ...eventRoutes]
  } catch {
    return staticRoutes
  }
}
