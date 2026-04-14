import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Alert Preferences',
}

export default function AlertsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
      </div>
      <h1 className="text-base font-semibold text-gray-900">Alert Preferences</h1>
      <p className="text-sm text-gray-500 max-w-sm">
        Alert configuration is coming soon. You&apos;ll be able to set up push, SMS, and other notification preferences here.
      </p>
    </div>
  )
}
