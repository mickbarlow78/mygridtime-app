// Phase 4: Public timetable page — SSG, no login required.
// Displays timetable for the given event slug.
// Returns 404 if event is not published or does not exist.
export default function PublicTimetablePage({
  params,
}: {
  params: { slug: string }
}) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Timetable</h1>
      <p className="mt-2 text-gray-500">
        Public timetable for <code>{params.slug}</code> coming in Phase 4.
      </p>
    </div>
  )
}
