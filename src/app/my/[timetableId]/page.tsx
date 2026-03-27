// Phase 7: View a personal timetable (driver/parent view with their sessions highlighted).
export default function PersonalTimetablePage({
  params,
}: {
  params: { timetableId: string }
}) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">My Timetable</h1>
      <p className="mt-2 text-gray-500">
        Personal timetable view — Phase 7.{' '}
        <span className="text-xs text-gray-400">(id: {params.timetableId})</span>
      </p>
    </div>
  )
}
