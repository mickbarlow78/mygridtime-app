'use client'

import { useState } from 'react'
import {
  CARD,
  CARD_PADDING,
  CARD_PADDING_COMPACT,
  LABEL,
  LABEL_COMPACT,
  INPUT,
  HELP_TEXT,
  BTN_PRIMARY,
  BTN_GHOST,
  BTN_SECONDARY_SM,
  ERROR_BANNER,
  H2,
} from '@/lib/styles'
import { FIELD_LIMITS } from '@/lib/constants/field-limits'
import { CharCounter } from '@/components/ui/CharCounter'
import { countDaysInRange, MAX_EVENT_DAYS } from '@/lib/utils/slug'
import type { ExtractedEvent, ExtractedDay, ExtractedEntry } from '@/lib/ai/extract'

interface Props {
  initialEvent: ExtractedEvent
  submitting: boolean
  error: string | null
  onConfirm: (edited: ExtractedEvent) => void
  onDiscard: () => void
}

/**
 * Editable preview of an extracted event (MGT-069 Phase A).
 *
 * All fields are locally editable; on confirm the edited state is returned to
 * the parent, which calls `createEvent()` + `saveExtractedEventContent()`.
 * Discard throws away the preview without any server round-trip.
 */
export function ExtractionPreview({ initialEvent, submitting, error, onConfirm, onDiscard }: Props) {
  const [state, setState] = useState<ExtractedEvent>(initialEvent)
  const [localError, setLocalError] = useState<string | null>(null)

  function updateMeta<K extends keyof ExtractedEvent>(key: K, value: ExtractedEvent[K]) {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  function updateDay(dayIndex: number, patch: Partial<ExtractedDay>) {
    setState((prev) => ({
      ...prev,
      days: prev.days.map((d, i) => (i === dayIndex ? { ...d, ...patch } : d)),
    }))
  }

  function updateEntry(dayIndex: number, entryIndex: number, patch: Partial<ExtractedEntry>) {
    setState((prev) => ({
      ...prev,
      days: prev.days.map((d, i) => {
        if (i !== dayIndex) return d
        return {
          ...d,
          entries: d.entries.map((e, j) => (j === entryIndex ? { ...e, ...patch } : e)),
        }
      }),
    }))
  }

  function removeEntry(dayIndex: number, entryIndex: number) {
    setState((prev) => ({
      ...prev,
      days: prev.days.map((d, i) => {
        if (i !== dayIndex) return d
        return { ...d, entries: d.entries.filter((_, j) => j !== entryIndex) }
      }),
    }))
  }

  function addEntry(dayIndex: number) {
    setState((prev) => ({
      ...prev,
      days: prev.days.map((d, i) => {
        if (i !== dayIndex) return d
        return {
          ...d,
          entries: [
            ...d.entries,
            {
              title: '',
              start_time: '09:00',
              end_time: null,
              category: null,
              notes: null,
              is_break: false,
            },
          ],
        }
      }),
    }))
  }

  function handleConfirm() {
    setLocalError(null)
    if (!state.title.trim()) { setLocalError('Title is required.'); return }
    if (!state.start_date)   { setLocalError('Start date is required.'); return }
    if (!state.end_date)     { setLocalError('End date is required.'); return }
    if (state.end_date < state.start_date) {
      setLocalError('End date must be on or after start date.')
      return
    }

    const days = countDaysInRange(state.start_date, state.end_date)
    if (days === 0) { setLocalError('Date range is invalid.'); return }
    if (days > MAX_EVENT_DAYS) {
      setLocalError(`Events are limited to ${MAX_EVENT_DAYS} days. The selected range spans ${days} days — please shorten it.`)
      return
    }
    if (state.days.length > MAX_EVENT_DAYS) {
      setLocalError(`Events are limited to ${MAX_EVENT_DAYS} days. This extraction contains ${state.days.length} days — please remove some before confirming.`)
      return
    }

    onConfirm(state)
  }

  const banner = localError ?? error

  return (
    <div className="space-y-5">
      <div className={`${CARD} ${CARD_PADDING}`}>
        <h2 className={`${H2} mb-3`}>Event details</h2>
        <p className={`${HELP_TEXT} mb-4`}>
          Review and edit the extracted values. Nothing is saved until you click{' '}
          <span className="font-medium text-gray-600">Create event</span>.
        </p>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="ex-title" className={LABEL}>Title <span className="text-red-500">*</span></label>
              <CharCounter used={state.title.length} max={FIELD_LIMITS.event.title} />
            </div>
            <input
              id="ex-title"
              type="text"
              value={state.title}
              onChange={(e) => updateMeta('title', e.target.value)}
              maxLength={FIELD_LIMITS.event.title}
              className={INPUT}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="ex-venue" className={LABEL}>Venue</label>
              <CharCounter used={(state.venue ?? '').length} max={FIELD_LIMITS.event.venue} />
            </div>
            <input
              id="ex-venue"
              type="text"
              value={state.venue ?? ''}
              onChange={(e) => updateMeta('venue', e.target.value || null)}
              maxLength={FIELD_LIMITS.event.venue}
              className={INPUT}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ex-start" className={LABEL}>Start date <span className="text-red-500">*</span></label>
              <input
                id="ex-start"
                type="date"
                value={state.start_date}
                onChange={(e) => {
                  const v = e.target.value
                  setState((prev) => ({
                    ...prev,
                    start_date: v,
                    end_date: prev.end_date && prev.end_date >= v ? prev.end_date : v,
                  }))
                }}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="ex-end" className={LABEL}>End date <span className="text-red-500">*</span></label>
              <input
                id="ex-end"
                type="date"
                value={state.end_date}
                min={state.start_date}
                onChange={(e) => updateMeta('end_date', e.target.value)}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ex-tz" className={LABEL}>Timezone</label>
            <select
              id="ex-tz"
              value={state.timezone}
              onChange={(e) => updateMeta('timezone', e.target.value)}
              className={`${INPUT} bg-white`}
            >
              <option value="Europe/London">Europe/London (UK)</option>
              <option value="Europe/Paris">Europe/Paris (CET)</option>
              <option value="America/New_York">America/New_York (ET)</option>
              <option value="America/Chicago">America/Chicago (CT)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
              <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="ex-notes" className={LABEL}>Notes</label>
              <CharCounter used={(state.notes ?? '').length} max={FIELD_LIMITS.event.notes} />
            </div>
            <textarea
              id="ex-notes"
              value={state.notes ?? ''}
              onChange={(e) => updateMeta('notes', e.target.value || null)}
              rows={2}
              maxLength={FIELD_LIMITS.event.notes}
              className={`${INPUT} resize-none`}
            />
          </div>
        </div>
      </div>

      {state.days.map((day, di) => (
        <div key={di} className={`${CARD} ${CARD_PADDING}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={H2}>Day {di + 1}</h2>
            <span className="text-xs text-gray-400">{day.entries.length} entries</span>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between">
              <label className={LABEL_COMPACT}>Label</label>
              <CharCounter used={(day.label ?? '').length} max={FIELD_LIMITS.event.dayLabel} />
            </div>
            <input
              type="text"
              value={day.label ?? ''}
              onChange={(e) => updateDay(di, { label: e.target.value || null })}
              maxLength={FIELD_LIMITS.event.dayLabel}
              placeholder="e.g. Practice day"
              className={INPUT}
            />
          </div>

          <div className="space-y-3">
            {day.entries.map((entry, ei) => (
              <div key={ei} className={`${CARD_PADDING_COMPACT} border border-gray-200 rounded-md`}>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                    <label className={LABEL_COMPACT}>Title</label>
                    <input
                      type="text"
                      value={entry.title}
                      onChange={(e) => updateEntry(di, ei, { title: e.target.value })}
                      maxLength={FIELD_LIMITS.entry.title}
                      className={INPUT}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className={LABEL_COMPACT}>Start</label>
                    <input
                      type="time"
                      value={entry.start_time}
                      onChange={(e) => updateEntry(di, ei, { start_time: e.target.value })}
                      className={INPUT}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className={LABEL_COMPACT}>End</label>
                    <input
                      type="time"
                      value={entry.end_time ?? ''}
                      onChange={(e) => updateEntry(di, ei, { end_time: e.target.value || null })}
                      className={INPUT}
                    />
                  </div>
                  <div className="col-span-3">
                    <label className={LABEL_COMPACT}>Category</label>
                    <input
                      type="text"
                      value={entry.category ?? ''}
                      onChange={(e) => updateEntry(di, ei, { category: e.target.value || null })}
                      maxLength={FIELD_LIMITS.entry.category}
                      className={INPUT}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={entry.is_break}
                      onChange={(e) => updateEntry(di, ei, { is_break: e.target.checked })}
                    />
                    Break
                  </label>
                  <button
                    type="button"
                    onClick={() => removeEntry(di, ei)}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => addEntry(di)}
              className={BTN_SECONDARY_SM}
            >
              + Add entry
            </button>
          </div>
        </div>
      ))}

      {banner && <p className={ERROR_BANNER}>{banner}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={BTN_PRIMARY}
        >
          {submitting ? 'Creating…' : 'Create event'}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={submitting}
          className={BTN_GHOST}
        >
          Discard and start from scratch
        </button>
      </div>
    </div>
  )
}
