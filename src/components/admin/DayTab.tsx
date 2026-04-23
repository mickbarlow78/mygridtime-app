'use client'

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { EntryRow, type EntryDraft, type EntryValidationError, type EntryChangeInfo } from './EntryRow'

interface DayTabProps {
  dayId: string
  entries: EntryDraft[]
  errors: EntryValidationError[]
  entryChangeInfos?: Record<string, EntryChangeInfo>  // keyed by _localId
  savedEntriesById?: Record<string, EntryDraft>        // keyed by entry db id
  onEntriesChange: (dayId: string, entries: EntryDraft[]) => void
  onDeleteEntry: (dayId: string, localId: string) => void
  onRevertEntry?: (dayId: string, localId: string) => void
  onRevertEntryField?: (dayId: string, localId: string, field: string) => void
}

export function DayTab({
  dayId,
  entries,
  errors,
  entryChangeInfos,
  onEntriesChange,
  onDeleteEntry,
  onRevertEntry,
  onRevertEntryField,
}: DayTabProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = entries.findIndex((e) => e._localId === active.id)
    const newIndex = entries.findIndex((e) => e._localId === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(entries, oldIndex, newIndex).map((e, i) => ({ ...e, sort_order: i }))
    onEntriesChange(dayId, reordered)
  }

  function handleEntryChange(updated: EntryDraft) {
    onEntriesChange(dayId, entries.map((e) => (e._localId === updated._localId ? updated : e)))
  }

  function handleDuplicateEntry(localId: string) {
    const idx = entries.findIndex((e) => e._localId === localId)
    if (idx === -1) return
    const source = entries[idx]
    const clone: EntryDraft = {
      _localId: crypto.randomUUID(),
      id: null,
      event_day_id: dayId,
      title: source.title,
      start_time: source.start_time,
      end_time: source.end_time,
      category: source.category,
      notes: source.notes,
      is_break: source.is_break,
      sort_order: 0, // recalculated below
    }
    const next = [
      ...entries.slice(0, idx + 1),
      clone,
      ...entries.slice(idx + 1),
    ].map((e, i) => ({ ...e, sort_order: i }))
    onEntriesChange(dayId, next)
  }

  function handleAddEntry() {
    const newEntry: EntryDraft = {
      _localId: crypto.randomUUID(),
      id: null,
      event_day_id: dayId,
      title: '',
      start_time: '',
      end_time: '',
      category: '',
      notes: '',
      sort_order: entries.length,
      is_break: false,
    }
    onEntriesChange(dayId, [...entries, newEntry])
  }

  const errorMap = Object.fromEntries(errors.map((e) => [e._localId, e]))

  return (
    <div className="space-y-2">
      {/* Column headers — desktop only */}
      {entries.length > 0 && (
        <div className="hidden md:flex items-center gap-2 px-3 pb-0.5">
          <div className="w-10 shrink-0" />
          <div className="flex-1 grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5 text-xs text-gray-600 font-medium uppercase tracking-wide">
            <span className="col-span-5">Title</span>
            <span className="col-span-2">Start</span>
            <span className="col-span-2">End</span>
            <span className="col-span-2">Category</span>
            <span className="col-span-3">Notes</span>
          </div>
          <div className="w-5 shrink-0" />
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={entries.map((e) => e._localId)} strategy={verticalListSortingStrategy}>
          {entries.map((entry) => (
            <EntryRow
              key={entry._localId}
              entry={entry}
              errors={errorMap[entry._localId]}
              changeInfo={entryChangeInfos?.[entry._localId]}
              onChange={handleEntryChange}
              onDelete={() => onDeleteEntry(dayId, entry._localId)}
              onDuplicate={() => handleDuplicateEntry(entry._localId)}
              onRevertRow={onRevertEntry ? () => onRevertEntry(dayId, entry._localId) : undefined}
              onRevertField={onRevertEntryField ? (f) => onRevertEntryField(dayId, entry._localId, f) : undefined}
            />
          ))}
        </SortableContext>
      </DndContext>

      {entries.length === 0 && (
        <p className="text-sm text-gray-400 italic py-4 text-center">
          No entries yet. Add the first one below.
        </p>
      )}

      <button
        type="button"
        onClick={handleAddEntry}
        className="w-full mt-1 py-3 text-sm text-gray-500 border border-dashed border-gray-300 rounded-md hover:border-gray-400 hover:text-gray-700 transition-colors md:py-2"
      >
        + Add entry
      </button>
    </div>
  )
}
