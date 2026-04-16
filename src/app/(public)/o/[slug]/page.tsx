/**
 * Legacy public organisation route — /o/[slug]
 *
 * Pass C1 moved the public organisation page to `/{orgSlug}`. This route is
 * preserved as a 308 permanent redirect so previously shared `/o/{slug}` URLs
 * (printed collateral, bookmarks, copied addresses) continue to resolve to
 * the new canonical location. The slug itself is preserved verbatim.
 *
 * The legacy `o` segment remains a reserved top-level slug
 * (`src/lib/constants/reserved-slugs.ts`) so a new organisation cannot be
 * created with `slug = 'o'` and shadow this redirect.
 */

import { permanentRedirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { slug: string }
}

export default function LegacyPublicOrgPage({ params }: PageProps) {
  permanentRedirect(`/${params.slug}`)
}
