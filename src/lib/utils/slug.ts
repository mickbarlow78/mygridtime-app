/**
 * Converts a string to a URL-safe slug.
 * e.g. "Round 3 — Whilton Mill" → "round-3-whilton-mill"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')   // strip non-word chars (keep hyphens)
    .replace(/[\s_]+/g, '-')    // spaces/underscores → hyphens
    .replace(/-{2,}/g, '-')     // collapse multiple hyphens
    .replace(/^-+|-+$/g, '')    // trim leading/trailing hyphens
}

/**
 * Returns an array of ISO date strings (YYYY-MM-DD) for every day
 * from startDate to endDate inclusive.
 */
export function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')
  // Guard against invalid or reversed ranges (max 14 days)
  let count = 0
  while (current <= end && count < 14) {
    dates.push(current.toISOString().split('T')[0])
    current.setUTCDate(current.getUTCDate() + 1)
    count++
  }
  return dates
}

/**
 * Formats an ISO date string as a human-readable date.
 * e.g. "2026-05-10" → "Sat 10 May"
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate + 'T00:00:00Z')
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
