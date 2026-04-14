export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Page heading skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 bg-gray-200 rounded" />
        <div className="h-9 w-32 bg-gray-200 rounded-md" />
      </div>

      {/* Card list skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="h-5 w-64 bg-gray-200 rounded" />
            <div className="h-4 w-40 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
