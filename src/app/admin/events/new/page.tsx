// Phase 3: Create event form — title, venue, start date, end date, timezone, notes.
// On submit: generates slug, inserts event (status=draft), auto-creates event days,
// writes audit log, redirects to /admin/events/[id].
export default function NewEventPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Create Event</h1>
      <p className="mt-2 text-gray-500">Event creation form coming in Phase 3.</p>
    </div>
  )
}
