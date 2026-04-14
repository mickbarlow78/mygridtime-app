import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Drivers',
}

export default function DriversPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
      <h1 className="text-base font-semibold text-gray-900">My Drivers</h1>
      <p className="text-sm text-gray-500 max-w-sm">
        Driver management is coming soon. You&apos;ll be able to add and manage driver profiles here.
      </p>
    </div>
  )
}
