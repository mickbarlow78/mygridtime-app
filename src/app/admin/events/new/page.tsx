'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createEvent } from '../actions'
import { listTemplates, createEventFromTemplate } from '@/app/admin/templates/actions'
import type { TemplateSummary } from '@/app/admin/templates/actions'
import { TemplatePicker } from '@/components/admin/TemplatePicker'
import { cn, CONTAINER_FORM, BREADCRUMB, BREADCRUMB_LINK, BREADCRUMB_SEP, BREADCRUMB_CURRENT, H1, SUBTITLE, CARD, CARD_PADDING, CARD_PADDING_COMPACT, LABEL, INPUT, HELP_TEXT, BTN_PRIMARY, BTN_GHOST, ERROR_BANNER, TAB_BAR, TAB_ACTIVE, TAB_INACTIVE } from '@/lib/styles'

export default function NewEventPage() {
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [venue, setVenue] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [timezone, setTimezone] = useState('Europe/London')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Template state ──────────────────────────────────────────────────────
  const [mode, setMode] = useState<'blank' | 'template'>('blank')
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templatesLoaded, setTemplatesLoaded] = useState(false)

  const searchParams = useSearchParams()
  const preselectedTemplate = searchParams.get('template')

  useEffect(() => {
    listTemplates().then((result) => {
      if (result.success) {
        setTemplates(result.data)
        // If ?template= is present and matches a real template, preselect it
        if (preselectedTemplate && result.data.some((t) => t.id === preselectedTemplate)) {
          setMode('template')
          setSelectedTemplateId(preselectedTemplate)
        }
      }
      setTemplatesLoaded(true)
    })
  }, [preselectedTemplate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) { setError('Title is required.'); return }
    if (!startDate)     { setError('Start date is required.'); return }
    if (!endDate)       { setError('End date is required.'); return }
    if (endDate < startDate) { setError('End date must be on or after start date.'); return }

    if (mode === 'template' && selectedTemplateId) {
      setSubmitting(true)
      const result = await createEventFromTemplate(selectedTemplateId, {
        title, venue, start_date: startDate, end_date: endDate, timezone, notes,
      })
      if (!result.success) {
        setError(result.error)
        setSubmitting(false)
        return
      }
      router.push(`/admin/events/${result.data.id}`)
      return
    }

    setSubmitting(true)
    const result = await createEvent({ title, venue, start_date: startDate, end_date: endDate, timezone, notes })
    if (!result.success) {
      setError(result.error)
      setSubmitting(false)
      return
    }
    router.push(`/admin/events/${result.data.id}`)
  }

  const hasTemplates = templatesLoaded && templates.length > 0

  return (
    <div className={`${CONTAINER_FORM} space-y-6`}>
      {/* Breadcrumb */}
      <div className={BREADCRUMB}>
        <Link href="/admin" className={BREADCRUMB_LINK}>Events</Link>
        <span className={BREADCRUMB_SEP}>/</span>
        <span className={BREADCRUMB_CURRENT}>New event</span>
      </div>

      <div>
        <h1 className={H1}>Create event</h1>
        <p className={SUBTITLE}>
          Days will be automatically created from your date range. You can add or remove days in the editor.
        </p>
      </div>

      {/* Mode toggle — only shown when templates exist */}
      {hasTemplates && (
        <div className={TAB_BAR}>
          <button
            type="button"
            onClick={() => { setMode('blank'); setSelectedTemplateId(null) }}
            className={mode === 'blank' ? TAB_ACTIVE : TAB_INACTIVE}
          >
            Start blank
          </button>
          <button
            type="button"
            onClick={() => setMode('template')}
            className={mode === 'template' ? TAB_ACTIVE : TAB_INACTIVE}
          >
            Use template
          </button>
        </div>
      )}

      {/* Template picker */}
      {mode === 'template' && hasTemplates && (
        <div className={`${CARD} ${CARD_PADDING_COMPACT}`}>
          <p className="text-sm font-medium text-gray-700 mb-3">Select a template</p>
          <TemplatePicker
            templates={templates}
            selectedId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className={`${CARD} ${CARD_PADDING} space-y-4`}>
        {/* Title */}
        <div>
          <label htmlFor="title" className={LABEL}>
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Round 3 — Whilton Mill"
            required
            autoFocus
            className={INPUT}
          />
        </div>

        {/* Venue */}
        <div>
          <label htmlFor="venue" className={LABEL}>
            Venue
          </label>
          <input
            id="venue"
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="e.g. Whilton Mill Karting"
            className={INPUT}
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="start_date" className={LABEL}>
              Start date <span className="text-red-500">*</span>
            </label>
            <input
              id="start_date"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                // Auto-advance end date if it would become invalid
                if (!endDate || e.target.value > endDate) setEndDate(e.target.value)
              }}
              required
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="end_date" className={LABEL}>
              End date <span className="text-red-500">*</span>
            </label>
            <input
              id="end_date"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              className={INPUT}
            />
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label htmlFor="timezone" className={LABEL}>
            Timezone
          </label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
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

        {/* Notes */}
        <div>
          <label htmlFor="notes" className={LABEL}>
            Notes{' '}
            <span className="text-xs text-gray-400 font-normal">(internal, not shown publicly)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Any internal notes about this event…"
            className={`${INPUT} resize-none`}
          />
        </div>

        {/* Error */}
        {error && (
          <p className={ERROR_BANNER}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting || (mode === 'template' && !selectedTemplateId)}
            className={BTN_PRIMARY}
          >
            {submitting ? 'Creating…' : mode === 'template' ? 'Create from template' : 'Create event'}
          </button>
          <Link
            href="/admin"
            className={BTN_GHOST}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
