import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Upload Timetable',
}

export default function UploadPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      </div>
      <h1 className="text-base font-semibold text-gray-900">Upload Timetable</h1>
      <p className="text-sm text-gray-500 max-w-sm">
        Timetable upload is coming soon. You&apos;ll be able to upload PDFs and photos for automatic timetable extraction here.
      </p>
    </div>
  )
}
