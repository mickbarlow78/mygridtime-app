'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/styles'

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

/**
 * Change state for a single entry row. Provided by EventEditor, based on
 * comparing current values against the last saved baseline.
 */
export interface EntryChangeInfo {
  rowKind: 'added' | 'edited'
  rowStatus: 'pending' | 'rejected'
  /** Fields that differ from saved values. Only populated for 'edited' rows. */
  changedFields: Set<string>
  /** Saved values for field-level revert. Only populated for 'edited' rows. */
  savedValues: Partial<Record<keyof EntryDraft, unknown>>
}

interface EntryRowProps {
  entry: EntryDraft
  errors?: EntryValidationError
  changeInfo?: EntryChangeInfo
  onChange: (updated: EntryDraft) => void
  onDelete: () => void
  /** Revert all changed fields to saved values (only meaningful for 'edited' rows). */
  onRevertRow?: () => void
  /** Revert a single field to its saved value. */
  onRevertField?: (field: string) => void
}

// ── Styling helpers ───────────────────────────────────────────────────────────

function rowBg(changeInfo: EntryChangeInfo | undefined, hasError: boolean): string {
  if (hasError) return 'border-red-300 bg-red-50/40'
  if (!changeInfo) return 'border-gray-200 bg-white'

  if (changeInfo.rowKind === 'added') {
    return changeInfo.rowStatus === 'rejected'
      ? 'border-red-300 bg-red-50/50'
      : 'border-green-300 bg-green-50/40'
  }
  // edited
  return changeInfo.rowStatus === 'rejected'
    ? 'border-red-300 bg-red-50/40'
    : 'border-amber-300 bg-amber-50/30'
}

function fieldClass(
  baseClass: string,
  field: string,
  changeInfo: EntryChangeInfo | undefined,
  errFields: string[]
): string {
  if (errFields.includes(field)) return `${baseClass} border-red-400 bg-red-50`
  if (!changeInfo || changeInfo.rowKind !== 'edited') return `${baseClass} border-gray-200`
  if (!changeInfo.changedFields.has(field)) return `${baseClass} border-gray-200`
  return changeInfo.rowStatus === 'rejected'
    ? `${baseClass} border-red-400 bg-red-50/70`
    : `${baseClass} border-amber-400 bg-amber-50/70`
}

// ── Field wrapper with inline revert button ───────────────────────────────────

interface FieldWrapperProps {
  colSpan: string
  field: string
  changeInfo?: EntryChangeInfo
  savedDisplay?: string
  onRevertField?: (field: string) => void
  children: React.ReactNode
}

function FieldWrapper({ colSpan, field, changeInfo, savedDisplay, onRevertField, children }: FieldWrapperProps) {
  const isChanged = changeInfo?.rowKind === 'edited' && changeInfo.changedFields.has(field)
  const canRevert = isChanged && !!onRevertField

  return (
    <div className={`${colSpan} flex items-center gap-0.5 group/field`}>
      <div className="flex-1 min-w-0">{children}</div>
      {canRevert && (
        <button
          type="button"
          onClick={() => onRevertField!(field)}
          title={savedDisplay ? `Revert to: ${savedDisplay}` : 'Revert to saved value'}
          className="shrink-0 text-[10px] leading-none px-0.5 text-amber-500 hover:text-amber-700 opacity-0 group-hover/field:opacity-100 transition-opacity"
        >
          ↩
        </button>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EntryRow({
  entry,
  errors,
  changeInfo,
  onChange,
  onDelete,
  onRevertRow,
  onRevertField,
}: EntryRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: entry._localId })

  const style = { transform: CSS.Transform.toString(transform), transition }

  const hasError = !!errors && errors.messages.length > 0
  const errFields = errors?.fields ?? []

  function upd(patch: Partial<EntryDraft>) { onChange({ ...entry, ...patch }) }

  const fmtSaved = (field: string): string => {
    const v = changeInfo?.savedValues?.[field as keyof EntryDraft]
    if (v === null || v === undefined || v === '') return '—'
    return String(v)
  }

  const baseInput = 'w-full text-sm px-2 py-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-gray-400'

  // Row label for added/edited
  const rowLabel = !changeInfo ? null : changeInfo.rowKind === 'added'
    ? (changeInfo.rowStatus === 'rejected' ? 'add rejected' : 'new')
    : changeInfo.rowStatus === 'rejected' ? 'edit rejected' : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-2 px-3 py-2.5 rounded-md border',
        isDragging && 'shadow-lg opacity-60 z-50',
        rowBg(changeInfo, hasError),
        entry.is_break && !changeInfo && 'bg-blue-50/30',
      )}
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
        {/* Row label (new / edit rejected) */}
        {rowLabel && (
          <div className="col-span-12 -mb-0.5">
            <span className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded',
              changeInfo?.rowStatus === 'rejected'
                ? 'text-red-600 bg-red-100'
                : 'text-green-700 bg-green-100',
            )}>
              {rowLabel}
            </span>
          </div>
        )}

        {/* Title */}
        <FieldWrapper
          colSpan="col-span-4"
          field="title"
          changeInfo={changeInfo}
          savedDisplay={fmtSaved('title')}
          onRevertField={onRevertField}
        >
          <input
            type="text"
            value={entry.title}
            onChange={(e) => upd({ title: e.target.value })}
            placeholder="Title *"
            className={fieldClass(baseInput, 'title', changeInfo, errFields)}
          />
        </FieldWrapper>

        {/* Start time */}
        <FieldWrapper
          colSpan="col-span-2"
          field="start_time"
          changeInfo={changeInfo}
          savedDisplay={fmtSaved('start_time')}
          onRevertField={onRevertField}
        >
          <input
            type="time"
            value={entry.start_time}
            onChange={(e) => upd({ start_time: e.target.value })}
            className={fieldClass(baseInput, 'start_time', changeInfo, errFields)}
          />
        </FieldWrapper>

        {/* End time */}
        <FieldWrapper
          colSpan="col-span-2"
          field="end_time"
          changeInfo={changeInfo}
          savedDisplay={fmtSaved('end_time')}
          onRevertField={onRevertField}
        >
          <input
            type="time"
            value={entry.end_time}
            onChange={(e) => upd({ end_time: e.target.value })}
            className={fieldClass(baseInput, 'end_time', changeInfo, errFields)}
          />
        </FieldWrapper>

        {/* Category */}
        <FieldWrapper
          colSpan="col-span-2"
          field="category"
          changeInfo={changeInfo}
          savedDisplay={fmtSaved('category')}
          onRevertField={onRevertField}
        >
          <input
            type="text"
            value={entry.category}
            onChange={(e) => upd({ category: e.target.value })}
            placeholder="Category"
            className={fieldClass(baseInput, 'category', changeInfo, errFields)}
          />
        </FieldWrapper>

        {/* Notes */}
        <FieldWrapper
          colSpan="col-span-2"
          field="notes"
          changeInfo={changeInfo}
          savedDisplay={fmtSaved('notes')}
          onRevertField={onRevertField}
        >
          <input
            type="text"
            value={entry.notes}
            onChange={(e) => upd({ notes: e.target.value })}
            placeholder="Notes"
            className={fieldClass(baseInput, 'notes', changeInfo, errFields)}
          />
        </FieldWrapper>

        {/* Validation messages */}
        {hasError && (
          <p className="col-span-12 text-xs text-red-600 -mt-0.5 px-0.5">
            {errors!.messages.join(' · ')}
          </p>
        )}
      </div>

      {/* Revert row (edited rows only) */}
      {changeInfo?.rowKind === 'edited' && onRevertRow && (
        <button
          type="button"
          onClick={onRevertRow}
          aria-label="Revert all changes on this row"
          title="Revert all changes"
          className="mt-1.5 w-5 h-5 flex items-center justify-center text-amber-400 hover:text-amber-600 transition-colors shrink-0 text-sm leading-none"
        >
          ↩
        </button>
      )}

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
