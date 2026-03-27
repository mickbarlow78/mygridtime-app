import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Event not found</h1>
      <p className="mt-2 text-gray-500">
        This event doesn&apos;t exist or is no longer available.
      </p>
      <Link href="/" className="mt-4 inline-block text-blue-600 hover:underline">
        Back to events
      </Link>
    </div>
  )
}
