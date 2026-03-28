'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export type EntryDraft = {
  /** Stable local key for DnD and React reconciliation; never sent to the server. */
  _localId: string
  id: string | null          // null = new entry not yet saved
  event_day_id: string
  title: string
  start_time: string
  end_time: string           // empty string = null/unset
  category: string           // empty string = null/unset
  notes: string              // empty string = null/unset
  sort_order: number
  is_break: boolean
}

export interface EntryValidationError {
  _localId: string
  fields: string[]
  messages: string[]
}

interface EntryRowProps {
  entry: EntryDraft
  errors?: EntryValidationError
  onChange: (updated: EntryDraft) => void
  onDelete: () => void
}

export function EntryRow({ entry, errors, onChange, onDelete }: EntryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry._localId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const hasError = !!errors && errors.messages.length > 0
  const errFields = errors?.fields ?? []

  function upd(patch: Partial<EntryDraft>) {
    onChange({ ...entry, ...patch })
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-start gap-2 px-3 py-2.5 rounded-md border bg-white',
        isDragging ? 'shadow-lg opacity-60 z-50' : '',
        hasError ? 'border-red-300 bg-red-50/40' : 'border-gray-200',
        entry.is_break ? 'bg-blue-50/30' : '',
      ].join(' ')}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Drag to reorder"
        className="mt-2 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0 select-none leading-none"
      >
        ⠿
      </button>

      {/* Break toggle */}
      <label className="flex flex-col items-center mt-2 shrink-0 cursor-pointer" title="Mark as break">
        <input
          type="checkbox"
          checked={entry.is_break}
          onChange={(e) => upd({ is_break: e.target.checked })}
          className="w-3.5 h-3.5 accent-gray-500"
        />
        <span className="text-[9px] text-gray-400 mt-0.5 leading-none">brk</span>
      </label>

      {/* Fields */}
      <div className="flex-1 grid grid-cols-12 gap-1.5 min-w-0">
        {/* Title */}
        <input
          type="text"
          value={entry.title}
          onChange={(e) => upd({ title: e.target.value })}
          placeholder="Title *"
          className={[
            'col-span-4 text-sm px-2 py-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-gray-400',
            errFields.includes('title') ? 'border-red-400 bg-red-50' : 'border-gray-200',
          ].join(' ')}
        />

        {/* Start time */}
        <input
          type="time"
          value={entry.start_time}
          onChange={(e) => upd({ start_time: e.target.value })}
          className={[
            'col-span-2 text-sm px-2 py-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-gray-400',
            errFields.includes('start_time') ? 'border-red-400 bg-red-50' : 'border-gray-200',
          ].join(' ')}
        />

        {/* End time */}
        <input
          type="time"
          value={entry.end_time}
          onChange={(e) => upd({ end_time: e.target.value })}
          className={[
            'col-span-2 text-sm px-2 py-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-gray-400',
            errFields.includes('end_time') ? 'border-red-400 bg-red-50' : 'border-gray-200',
          ].join(' ')}
        />

        {/* Category */}
        <input
          type="text"
          value={entry.category}
          onChange={(e) => upd({ category: e.target.value })}
          placeholder="Category"
          className="col-span-2 text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
        />

        {/* Notes */}
        <input
          type="text"
          value={entry.notes}
          onChange={(e) => upd({ notes: e.target.value })}
          placeholder="Notes"
          className="col-span-2 text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
        />

        {/* Validation messages */}
        {hasError && (
          <p className="col-span-12 text-xs text-red-600 -mt-0.5 px-0.5">
            {errors!.messages.join(' · ')}
          </p>
        )}
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete entry"
        className="mt-1.5 w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors shrink-0 text-sm leading-none"
      >
        ✕
      </button>
    </div>
  )
}
