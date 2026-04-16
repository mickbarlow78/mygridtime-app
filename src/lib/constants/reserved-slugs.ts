// Reserved top-level slugs.
//
// The public organisation page lives at `/{orgSlug}` and shares the top-level
// route namespace with per-event public pages (`/{eventSlug}`) and a fixed set
// of static / framework paths. Any new organisation slug must be checked
// against this list to avoid colliding with a real route. Existing event and
// organisation slugs are checked separately at organisation creation time.
//
// Comparison is case-insensitive — slugs are lowercased before insert anyway,
// but we normalise here for safety.

export const RESERVED_SLUGS: ReadonlyArray<string> = [
  // App route segments
  'admin',
  'api',
  'auth',
  'my',
  'invites',
  'notifications',
  // Static public pages
  'privacy',
  'terms',
  // Legacy public-org prefix — kept reserved so the redirect path
  // (/o/{slug} → /{slug}) cannot be shadowed by a new org slug.
  'o',
  // Framework / convention files served at the root
  '_next',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'manifest.json',
  'manifest.webmanifest',
  // Reserved for future expansion
  'sitemap',
  'robots',
  'public',
  'static',
  'app',
  'assets',
] as const

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug.trim().toLowerCase())
}
