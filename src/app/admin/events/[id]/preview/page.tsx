// Phase 3: Admin preview of the public timetable before publishing.
// Reuses TimetableView component (shared with Phase 4 public page).
export default function EventPreviewPage({
  params,
}: {
  params: { id: string }
}) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Event Preview</h1>
      <p className="mt-2 text-gray-500">
        Admin preview coming in Phase 3.{' '}
        <span className="text-xs text-gray-400">(id: {params.id})</span>
      </p>
    </div>
  )
}
