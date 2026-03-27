// Phase 4: Print-optimised A4 layout for the event timetable.
// No navigation chrome — clean output for browser print dialog.
export default function PrintTimetablePage({
  params,
}: {
  params: { slug: string }
}) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Print view</h1>
      <p className="mt-2 text-gray-500">
        Print layout for <code>{params.slug}</code> coming in Phase 4.
      </p>
    </div>
  )
}
