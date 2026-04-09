// Toggle to enable/disable notification debug logs across client and server.
// Set to false before shipping to production.
export const DEBUG_NOTIFICATIONS = true

export function debugLog(area: string, ...args: unknown[]): void {
  if (DEBUG_NOTIFICATIONS) console.log(`[${area}]`, ...args)
}
