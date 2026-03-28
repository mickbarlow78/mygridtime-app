import Link from 'next/link'

/**
 * Global 404 page.
 *
 * Shown when:
 *   - A public timetable page calls notFound() (draft, archived, or unknown slug).
 *   - Any other route does not match.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <p className="text-sm font-medium text-gray-400 mb-3">404</p>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Page not found</h1>
        <p className="text-sm text-gray-500 mb-8">
          This event doesn&apos;t exist or is no longer publicly available.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-700 border border-gray-300 rounded-md px-4 py-2 hover:bg-gray-50 transition-colors"
        >
          ← All events
        </Link>
      </div>
    </div>
  )
}
