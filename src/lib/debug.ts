// Toggle to enable/disable notification debug logs across client and server.
// Controlled via DEBUG_NOTIFICATIONS env var. Defaults to false (off in production).
export const DEBUG_NOTIFICATIONS = process.env.DEBUG_NOTIFICATIONS === 'true'

export function debugLog(area: string, ...args: unknown[]): void {
  if (DEBUG_NOTIFICATIONS) console.log(`[${area}]`, ...args)
}
