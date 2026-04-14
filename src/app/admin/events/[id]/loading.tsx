export default function EventEditorLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Back link + title skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-24 bg-gray-200 rounded" />
        <div className="h-7 w-72 bg-gray-200 rounded" />
      </div>

      {/* Actions bar skeleton */}
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-24 bg-gray-200 rounded-md" />
        ))}
      </div>

      {/* Editor area skeleton */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="h-5 w-48 bg-gray-200 rounded" />
        <div className="h-4 w-full bg-gray-100 rounded" />
        <div className="h-4 w-3/4 bg-gray-100 rounded" />
        <div className="h-4 w-1/2 bg-gray-100 rounded" />
      </div>
    </div>
  )
}
