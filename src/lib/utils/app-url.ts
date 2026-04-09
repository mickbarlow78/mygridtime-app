/**
 * Canonical app URL helpers.
 *
 * Resolution priority (highest → lowest):
 *   1. APP_URL              — server-only, never in browser bundle
 *   2. NEXT_PUBLIC_APP_URL  — baked into bundle by next.config.mjs at build
 *                             time from APP_URL ?? NEXT_PUBLIC_APP_URL ?? URL
 *   3. URL                  — Netlify auto-inject (server runtime only)
 *   4. NEXT_PUBLIC_SITE_URL — project default (.env.local / Supabase dashboard)
 *   5. http://localhost:3000 — local-dev fallback; never reached in production
 *                             when any of the above vars are set.
 *
 * Two exports:
 *   getServerAppUrl() — server actions, Route Handlers, email templates.
 *   getClientAppUrl() — 'use client' components (e.g. login form).
 *                       APP_URL and URL are excluded (not in browser bundle).
 */

/** Use in server actions, Route Handlers, and email helpers. */
export function getServerAppUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??  // already resolved by next.config.mjs
    process.env.URL ??                  // Netlify primary domain (server runtime)
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

/**
 * Use in 'use client' components.
 * APP_URL and URL are server-only env vars and are absent from the browser
 * bundle. NEXT_PUBLIC_APP_URL is pre-resolved by next.config.mjs at build
 * time to APP_URL ?? NEXT_PUBLIC_APP_URL ?? URL, so it is always populated
 * in production without any extra Netlify env var configuration.
 */
export function getClientAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??  // resolved at build time in next.config.mjs
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '')
}
