import { APP_VERSION, APP_COMMIT_SHA } from '@/lib/version'

/**
 * Build identity badge — fixed bottom-right overlay.
 *
 * Rendered only inside internal layouts (admin, my) so it does not leak
 * commit hashes to public consumer routes. See MGT-093.
 */
export function BuildIdentityBadge() {
  return (
    <span
      aria-label={
        APP_COMMIT_SHA
          ? `App version ${APP_VERSION}, build ${APP_COMMIT_SHA}`
          : `App version ${APP_VERSION}`
      }
      className="fixed bottom-1.5 right-2 z-50 select-none pointer-events-none rounded px-1.5 py-0.5 text-[10px] font-mono text-gray-500/70 bg-white/60 backdrop-blur-sm"
    >
      v{APP_VERSION}
      {APP_COMMIT_SHA ? ` | ${APP_COMMIT_SHA}` : ''}
    </span>
  )
}
