'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/styles'
import { FIELD_LIMITS } from '@/lib/constants/field-limits'
import { CharCounter } from '@/components/ui/CharCounter'

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
  /** Insert a clone of this row immediately below it. */
  onDuplicate?: () => void
  /** Revert all changed fields to saved values (only meaningful for 'edited' rows). */
  onRevertRow?: () => void
  /** Revert a single field to its saved value. */
  onRevertField?: (field: string) => void
}

// ── Styling helpers ───────────────────────────────────────────────────────────

function rowBg(changeInfo: EntryChangeInfo | undefined): string {
  if (!changeInfo) return 'border-gray-200 bg-white'

  if (changeInfo.rowStatus === 'rejected') return 'border-gray-200 border-l-4 border-l-red-400 bg-white'
  // pending added or edited
  return 'border-gray-200 border-l-4 border-l-amber-400 bg-white'
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
  /** Current character count, for the visible counter. */
  used?: number
  /** Maximum allowed length. Omit for non-text fields. */
  max?: number
}

function FieldWrapper({ colSpan, field, changeInfo, savedDisplay, onRevertField, children, used, max }: FieldWrapperProps) {
  const isChanged = changeInfo?.rowKind === 'edited' && changeInfo.changedFields.has(field)
  const canRevert = isChanged && !!onRevertField

  return (
    <div className={`${colSpan} flex items-start gap-0.5 group/field`}>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {children}
        {max !== undefined && (
          <CharCounter used={used ?? 0} max={max} className="self-end pr-0.5" />
        )}
      </div>
      {canRevert && (
        <button
          type="button"
          onClick={() => onRevertField!(field)}
          title={savedDisplay ? `Revert to: ${savedDisplay}` : 'Revert to saved value'}
          className="shrink-0 text-[10px] leading-none px-0.5 mt-2 text-amber-500 hover:text-amber-700 opacity-0 group-hover/field:opacity-100 transition-opacity"
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
  onDuplicate,
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

  const baseInput = 'w-full text-base px-2.5 py-2 border rounded focus:outline-none focus:ring-1 focus:ring-gray-400 md:text-sm md:px-2 md:py-1.5'

  // Row label: show a pill for new-pending and all rejected states; silent for pending-edited
  const rowLabel = !changeInfo ? null
    : changeInfo.rowStatus === 'rejected' ? (changeInfo.rowKind === 'added' ? 'add rejected' : 'edit rejected')
    : changeInfo.rowKind === 'added' ? 'new'
    : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/row flex flex-col gap-1.5 px-3 py-2.5 rounded-md border md:flex-row md:items-start md:gap-2',
        isDragging && 'shadow-lg opacity-60 z-50',
        rowBg(changeInfo),
        entry.is_break && !changeInfo && 'bg-gray-50',
      )}
    >
      {/* Top strip (mobile) / inline controls (desktop via md:contents) */}
      <div className="flex items-center justify-between md:contents">
        <div className="flex items-center gap-1.5 md:contents">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            type="button"
            aria-label="Drag to reorder"
            className="p-0.5 text-base text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0 select-none leading-none md:p-0 md:mt-2"
          >
            ⠿
          </button>

          {/* Break pill toggle */}
          <button
            type="button"
            onClick={() => upd({ is_break: !entry.is_break })}
            aria-pressed={entry.is_break}
            aria-label={entry.is_break ? 'Marked as break, click to mark as race' : 'Marked as race, click to mark as break'}
            title={entry.is_break ? 'Click to mark as race' : 'Click to mark as break'}
            className={cn(
              'shrink-0 text-[11px] font-medium px-1.5 py-1 rounded border transition-colors leading-none md:text-[10px] md:px-1.5 md:py-0.5 md:mt-2',
              entry.is_break
                ? 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'
                : 'text-gray-400 bg-white border-gray-200 hover:text-gray-600 hover:border-gray-300',
            )}
          >
            {entry.is_break ? 'Break' : 'Race'}
          </button>
        </div>

        {/* Trailing controls: revert (edited only) + duplicate + delete */}
        <div className="flex items-center gap-0.5 shrink-0 md:order-last md:mt-1.5">
          {changeInfo?.rowKind === 'edited' && onRevertRow && (
            <button
              type="button"
              onClick={onRevertRow}
              aria-label="Revert all changes on this row"
              title="Revert all changes"
              className="w-8 h-8 flex items-center justify-center text-amber-400 hover:text-amber-600 transition-colors text-base leading-none md:w-5 md:h-5 md:text-sm md:text-gray-300 md:group-hover/row:text-amber-400"
            >
              ↩
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              aria-label="Duplicate this entry"
              title="Duplicate row"
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors text-base leading-none md:w-5 md:h-5 md:text-sm md:text-gray-200 md:group-hover/row:text-gray-400 md:hover:text-gray-600"
            >
              ⧉
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete entry"
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors text-base leading-none md:w-5 md:h-5 md:text-sm md:text-gray-200 md:group-hover/row:text-gray-400"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 grid grid-cols-2 gap-2 min-w-0 md:grid-cols-[repeat(14,minmax(0,1fr))] md:gap-1.5">
        {/* Row label (new / edit rejected) */}
        {rowLabel && (
          <div className="col-span-full -mb-0.5">
            <span className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded',
              changeInfo?.rowStatus === 'rejected'
                ? 'text-red-600 bg-red-100'
                : 'text-amber-700 bg-amber-100',
            )}>
              {rowLabel}
            </span>
          </div>
        )}

        {/* Title */}
        <FieldWrapper
          colSpan="col-span-2 md:col-span-5"
          field="title"
          changeInfo={changeInfo}
          savedDisplay={fmtSaved('title')}
          onRevertField={onRevertField}
          used={entry.title.length}
          max={FIELD_LIMITS.entry.title}
        >
          <input
            type="text"
            value={entry.title}
            onChange={(e) => upd({ title: e.target.value })}
            placeholder="Title *"
            maxLength={FIELD_LIMITS.entry.title}
            className={fieldClass(baseInput, 'title', changeInfo, errFields)}
          />
        </FieldWrapper>

        {/* Start time */}
        <FieldWrapper
          colSpan="col-span-1 md:col-span-2"
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
          colSpan="col-span-1 md:col-span-2"
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
          colSpan="col-span-2 md:col-span-2"
          field="category"
          changeInfo={changeInfo}
          savedDisplay={fmtSaved('category')}
          onRevertField={onRevertField}
          used={entry.category.length}
          max={FIELD_LIMITS.entry.category}
        >
          <input
            type="text"
            value={entry.category}
            onChange={(e) => upd({ category: e.target.value })}
            placeholder="Category"
            maxLength={FIELD_LIMITS.entry.category}
            className={fieldClass(baseInput, 'category', changeInfo, errFields)}
          />
        </FieldWrapper>

        {/* Notes */}
        <FieldWrapper
          colSpan="col-span-2 md:col-span-3"
          field="notes"
          changeInfo={changeInfo}
          savedDisplay={fmtSaved('notes')}
          onRevertField={onRevertField}
          used={entry.notes.length}
          max={FIELD_LIMITS.entry.notes}
        >
          <input
            type="text"
            value={entry.notes}
            onChange={(e) => upd({ notes: e.target.value })}
            placeholder="Notes"
            maxLength={FIELD_LIMITS.entry.notes}
            className={fieldClass(baseInput, 'notes', changeInfo, errFields)}
          />
        </FieldWrapper>

        {/* Validation messages */}
        {hasError && (
          <p className="col-span-full text-xs text-red-600 -mt-0.5 px-0.5">
            {errors!.messages.join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
