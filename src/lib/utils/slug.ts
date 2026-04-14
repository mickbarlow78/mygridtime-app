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
 * Maximum number of days an event can span. Enforced by callers that
 * build events from a date range (create, create-from-template). Kept here
 * so the limit lives next to the range helper it constrains.
 */
export const MAX_EVENT_DAYS = 14

/**
 * Hard safety cap inside getDatesInRange() to defend against pathological
 * inputs (e.g. a typo that spans years). Well above MAX_EVENT_DAYS — callers
 * are expected to validate against MAX_EVENT_DAYS themselves and return a
 * clear error, rather than relying on this cap to silently truncate.
 */
const SAFETY_CAP_DAYS = 366

/**
 * Returns the inclusive number of days between two ISO date strings.
 * Returns 0 for reversed or invalid ranges. Does NOT enforce
 * MAX_EVENT_DAYS — callers compare and surface their own error.
 */
export function countDaysInRange(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0
  if (end < start) return 0
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1
}

/**
 * Returns an array of ISO date strings (YYYY-MM-DD) for every day
 * from startDate to endDate inclusive.
 *
 * Note: this helper no longer silently caps at 14 days. Callers that feed
 * its output into row inserts MUST validate the range length against
 * MAX_EVENT_DAYS *before* calling this and return a clear error on
 * overflow — otherwise the caller is responsible for any truncation.
 * A high safety cap (SAFETY_CAP_DAYS) still bounds the loop to prevent
 * runaway date generation from malformed input.
 */
export function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')
  if (isNaN(current.getTime()) || isNaN(end.getTime())) return dates
  let count = 0
  while (current <= end && count < SAFETY_CAP_DAYS) {
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
