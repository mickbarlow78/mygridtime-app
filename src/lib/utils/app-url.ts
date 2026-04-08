/**
 * Canonical app URL helpers.
 *
 * Resolution priority (highest → lowest):
 *   1. APP_URL              — server-only, never in browser bundle
 *   2. NEXT_PUBLIC_APP_URL  — explicit production URL, available everywhere
 *   3. NEXT_PUBLIC_SITE_URL — project default (set in .env.local / Supabase dashboard)
 *   4. http://localhost:3000 — local-dev fallback only; never used in production
 *                             if the three env vars above are correctly set.
 *
 * Two exports:
 *   getServerAppUrl() — server actions, Route Handlers, email templates.
 *                       Reads all four sources; call only in server-side code.
 *   getClientAppUrl() — 'use client' components (e.g. login form).
 *                       Skips APP_URL (not in browser bundle); never reads
 *                       window.location so the value is stable and predictable.
 */

/** Use in server actions, Route Handlers, and email helpers. */
export function getServerAppUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '') // strip any trailing slash
}

/**
 * Use in 'use client' components.
 * APP_URL is intentionally excluded — it is server-only and absent from the
 * browser bundle.
 */
export function getClientAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '')
}
