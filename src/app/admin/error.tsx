'use client'

import { useEffect } from 'react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="text-base font-semibold text-gray-900">Something went wrong</h1>
      <p className="text-sm text-gray-500 max-w-sm">
        An error occurred while loading this page.
      </p>
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-2 text-left max-w-sm w-full">
          <summary className="text-xs text-gray-400 cursor-pointer">Error details</summary>
          <pre className="mt-1 text-xs text-red-600 bg-red-50 rounded p-2 overflow-auto whitespace-pre-wrap">
            {error.message}
          </pre>
        </details>
      )}
      <div className="flex items-center justify-center gap-3 pt-4">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 text-sm text-white bg-gray-900 rounded-md px-4 py-2 hover:bg-gray-700 transition-colors"
        >
          Try again
        </button>
        <a
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-gray-700 border border-gray-300 rounded-md px-4 py-2 hover:bg-gray-50 transition-colors"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  )
}
