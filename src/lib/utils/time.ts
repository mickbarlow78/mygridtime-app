/**
 * Formats a database time string to "HH:MM" display format.
 * Supabase returns times as "HH:MM:SS" — this trims to "HH:MM".
 * Returns an empty string for null/undefined (no time to show).
 */
export function formatTime(time: string | null | undefined): string {
  if (!time) return ''
  return time.slice(0, 5)
}
