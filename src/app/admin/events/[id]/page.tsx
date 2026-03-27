// Phase 3: Core timetable builder.
// Top section: editable event metadata + publish/unpublish/archive/duplicate actions.
// Bottom section: day tabs with inline-editable entries and drag-and-drop reorder.
// Also includes collapsible audit log.
export default function EventEditorPage({
  params,
}: {
  params: { id: string }
}) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Event Editor</h1>
      <p className="mt-2 text-gray-500">
        Timetable builder coming in Phase 3.{' '}
        <span className="text-xs text-gray-400">(id: {params.id})</span>
      </p>
    </div>
  )
}
