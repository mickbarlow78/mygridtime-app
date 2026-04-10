'use client'

import { useState } from 'react'
import { DayTab } from './DayTab'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { addEventDay, removeEventDay, updateDayLabel } from '@/app/admin/events/actions'
import type { EntryDraft, EntryValidationError, EntryChangeInfo } from './EntryRow'
import type { EventDay } from '@/lib/types/database'
import { formatDate } from '@/lib/utils/slug'
import { cn, TAB_ACTIVE, TAB_INACTIVE, BTN_PRIMARY, LABEL_COMPACT, SUCCESS_BANNER } from '@/lib/styles'

interface TimetableBuilderProps {
  eventId: string
  days: EventDay[]
  dayEntries: Record<string, EntryDraft[]>
  validationErrors: Record<string, EntryValidationError[]>
  saving: boolean
  saveError: string | null
  saveSuccess: boolean
  entryChangeInfos?: Record<string, EntryChangeInfo>
  onDaysChange: (days: EventDay[]) => void
  onEntriesChange: (dayId: string, entries: EntryDraft[]) => void
  onDeleteEntry: (dayId: string, localId: string) => void
  onRevertEntry?: (dayId: string, localId: string) => void
  onRevertEntryField?: (dayId: string, localId: string, field: string) => void
  onSave: () => void
}

export function TimetableBuilder({
  eventId,
  days,
  dayEntries,
  validationErrors,
  saving,
  saveError,
  saveSuccess,
  entryChangeInfos,
  onDaysChange,
  onEntriesChange,
  onDeleteEntry,
  onRevertEntry,
  onRevertEntryField,
  onSave,
}: TimetableBuilderProps) {
  const [activeDayId, setActiveDayId] = useState<string>(days[0]?.id ?? '')

  const [showAddDay, setShowAddDay] = useState(false)
  const [newDayDate, setNewDayDate] = useState('')
  const [newDayLabel, setNewDayLabel] = useState('')
  const [addDayError, setAddDayError] = useState<string | null>(null)
  const [addingDay, setAddingDay] = useState(false)

  const [removingDayId, setRemovingDayId] = useState<string | null>(null)

  const [editingLabelDayId, setEditingLabelDayId] = useState<string | null>(null)
  const [labelDraft, setLabelDraft] = useState('')

  const activeDay = days.find((d) => d.id === activeDayId) ?? days[0] ?? null
  const activeDayEntries = activeDay ? (dayEntries[activeDay.id] ?? []) : []
  const activeDayErrors  = activeDay ? (validationErrors[activeDay.id] ?? []) : []

  async function handleAddDay() {
    if (!newDayDate) { setAddDayError('Please pick a date.'); return }
    setAddingDay(true)
    setAddDayError(null)
    const result = await addEventDay(eventId, newDayDate, newDayLabel)
    setAddingDay(false)
    if (!result.success) { setAddDayError(result.error); return }
    const newDay: EventDay = {
      id: result.data.id,
      event_id: eventId,
      date: newDayDate,
      label: newDayLabel.trim() || null,
      sort_order: days.length,
      created_at: new Date().toISOString(),
    }
    onDaysChange([...days, newDay])
    setActiveDayId(newDay.id)
    setShowAddDay(false)
    setNewDayDate('')
    setNewDayLabel('')
  }

  async function handleRemoveDay(dayId: string) {
    const result = await removeEventDay(dayId)
    if (!result.success) { alert('Failed to remove day: ' + result.error); return }
    const remaining = days.filter((d) => d.id !== dayId)
    onDaysChange(remaining)
    if (activeDayId === dayId) setActiveDayId(remaining[0]?.id ?? '')
    setRemovingDayId(null)
  }

  async function handleSaveLabel(dayId: string) {
    await updateDayLabel(dayId, labelDraft)
    onDaysChange(days.map((d) => d.id === dayId ? { ...d, label: labelDraft.trim() || null } : d))
    setEditingLabelDayId(null)
  }

  function dayLabel(day: EventDay) {
    return day.label ?? formatDate(day.date)
  }

  // Does this day have any pending/rejected changes?
  function dayHasChanges(dayId: string): boolean {
    const entries = dayEntries[dayId] ?? []
    return entries.some((e) => !!entryChangeInfos?.[e._localId])
  }

  return (
    <div className="space-y-4">
      {/* Day tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-gray-200 pb-0 -mb-px">
        {days.map((day) => {
          const hasChanges = dayHasChanges(day.id)
          return (
            <button
              key={day.id}
              type="button"
              onClick={() => setActiveDayId(day.id)}
              onDoubleClick={() => { setEditingLabelDayId(day.id); setLabelDraft(day.label ?? '') }}
              className={cn(
                day.id === activeDayId ? TAB_ACTIVE : TAB_INACTIVE,
                'whitespace-nowrap',
                validationErrors[day.id]?.length > 0 && 'text-red-600',
              )}
              title="Double-click to rename"
            >
              {editingLabelDayId === day.id ? (
                <input
                  autoFocus
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onBlur={() => handleSaveLabel(day.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveLabel(day.id)
                    if (e.key === 'Escape') setEditingLabelDayId(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-28 text-sm border border-gray-300 rounded px-1 py-0 focus:outline-none"
                />
              ) : (
                <>
                  {dayLabel(day)}
                  {hasChanges && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" />
                  )}
                </>
              )}
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => setShowAddDay(true)}
          className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
          title="Add a day"
        >
          + Day
        </button>
      </div>

      {/* Active day content */}
      {activeDay ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {formatDate(activeDay.date)}
              {activeDay.label && activeDay.label !== formatDate(activeDay.date) && (
                <span className="ml-1">· {activeDay.label}</span>
              )}
              <span className="ml-2 text-gray-300">— double-click tab to rename</span>
            </p>
            {days.length > 1 && (
              <button
                type="button"
                onClick={() => setRemovingDayId(activeDay.id)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Remove this day
              </button>
            )}
          </div>

          <DayTab
            dayId={activeDay.id}
            entries={activeDayEntries}
            errors={activeDayErrors}
            entryChangeInfos={entryChangeInfos}
            onEntriesChange={onEntriesChange}
            onDeleteEntry={onDeleteEntry}
            onRevertEntry={onRevertEntry}
            onRevertEntryField={onRevertEntryField}
          />
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic py-6 text-center">
          No days yet. Add the first day using the + Day button above.
        </p>
      )}

      {/* Save timetable */}
      <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className={BTN_PRIMARY}
        >
          {saving ? 'Saving…' : 'Save timetable'}
        </button>
        {saveSuccess && !saving && <p className={SUCCESS_BANNER} role="status">Timetable saved.</p>}
        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      </div>

      {/* Add Day dialog */}
      <ConfirmDialog
        open={showAddDay}
        title="Add a day"
        description="Pick a date to add to this event."
        confirmLabel={addingDay ? 'Adding…' : 'Add day'}
        onConfirm={handleAddDay}
        onCancel={() => { setShowAddDay(false); setAddDayError(null) }}
      >
        <div className="space-y-2">
          <div>
            <label className={LABEL_COMPACT}>Date *</label>
            <input
              type="date"
              value={newDayDate}
              onChange={(e) => setNewDayDate(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
          <div>
            <label className={LABEL_COMPACT}>
              Label <span className="text-gray-400 font-normal">(optional — overrides date display)</span>
            </label>
            <input
              type="text"
              value={newDayLabel}
              onChange={(e) => setNewDayLabel(e.target.value)}
              placeholder="e.g. Practice Day"
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>
          {addDayError && <p className="text-xs text-red-600">{addDayError}</p>}
        </div>
      </ConfirmDialog>

      {/* Remove Day confirm */}
      <ConfirmDialog
        open={!!removingDayId}
        title="Remove this day?"
        description="All timetable entries for this day will be permanently deleted."
        confirmLabel="Remove day"
        confirmDestructive
        onConfirm={() => removingDayId && handleRemoveDay(removingDayId)}
        onCancel={() => setRemovingDayId(null)}
      />
    </div>
  )
}
