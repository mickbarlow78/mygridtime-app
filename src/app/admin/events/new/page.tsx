'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createEvent } from '../actions'
import { listTemplates, createEventFromTemplate } from '@/app/admin/templates/actions'
import type { TemplateSummary } from '@/app/admin/templates/actions'
import { TemplatePicker } from '@/components/admin/TemplatePicker'
import { ExtractionPreview } from '@/components/admin/ExtractionPreview'
import {
  extractEventFromUpload,
  saveExtractedEventContent,
  type ExtractionMeta,
} from '@/app/admin/events/extract/actions'
import type { ExtractedEvent } from '@/lib/ai/extract'
import { CONTAINER_FORM, BREADCRUMB, BREADCRUMB_LINK, BREADCRUMB_SEP, BREADCRUMB_CURRENT, H1, SUBTITLE, CARD, CARD_PADDING, CARD_PADDING_COMPACT, LABEL, INPUT, HELP_TEXT, BTN_PRIMARY, BTN_GHOST, ERROR_BANNER, TAB_BAR, TAB_ACTIVE, TAB_INACTIVE } from '@/lib/styles'
import { FIELD_LIMITS } from '@/lib/constants/field-limits'
import { CharCounter } from '@/components/ui/CharCounter'

type Mode = 'blank' | 'template' | 'extract'

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

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
  const [mode, setMode] = useState<Mode>('blank')
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)

  // ── Extraction state (MGT-069 Phase A) ──────────────────────────────────
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedEvent | null>(null)
  const [extractedMeta, setExtractedMeta] = useState<ExtractionMeta | null>(null)

  const searchParams = useSearchParams()
  const preselectedTemplate = searchParams.get('template')

  const loadTemplates = useCallback(() => {
    setTemplatesError(null)
    setTemplatesLoaded(false)
    listTemplates().then((result) => {
      if (result.success) {
        setTemplates(result.data)
        if (preselectedTemplate && result.data.some((t) => t.id === preselectedTemplate)) {
          setMode('template')
          setSelectedTemplateId(preselectedTemplate)
        }
      } else {
        setTemplates([])
        setTemplatesError(result.error ?? 'Could not load templates. Please retry.')
      }
      setTemplatesLoaded(true)
    })
  }, [preselectedTemplate])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so picking the same file twice re-triggers the change.
    e.target.value = ''
    if (!file) return

    setUploadError(null)

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setUploadError('Please upload a PDF, PNG, or JPG file.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('That file is larger than 10 MB. Please upload a smaller file.')
      return
    }
    if (file.size === 0) {
      setUploadError('That file appears to be empty.')
      return
    }

    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const result = await extractEventFromUpload(fd)
    setUploading(false)

    if (!result.success) {
      setUploadError(result.error)
      return
    }
    setExtracted(result.data.event)
    setExtractedMeta(result.data.meta)
  }

  async function handleExtractedConfirm(edited: ExtractedEvent) {
    if (!extractedMeta) return
    setError(null)
    setSubmitting(true)

    const createResult = await createEvent({
      title: edited.title,
      venue: edited.venue ?? '',
      start_date: edited.start_date,
      end_date: edited.end_date,
      timezone: edited.timezone,
      notes: edited.notes ?? '',
    })
    if (!createResult.success) {
      setError(createResult.error)
      setSubmitting(false)
      return
    }

    const saveResult = await saveExtractedEventContent(
      createResult.data.id,
      edited.days,
      extractedMeta,
    )
    if (!saveResult.success) {
      // saveExtractedEventContent already rolled back the event on failure.
      setError(saveResult.error)
      setSubmitting(false)
      return
    }

    router.push(`/admin/events/${createResult.data.id}`)
  }

  function handleExtractedDiscard() {
    setExtracted(null)
    setExtractedMeta(null)
    setUploadError(null)
    setError(null)
    setMode('blank')
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

      {/* Templates load error banner */}
      {templatesError && (
        <div className={ERROR_BANNER}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p>{templatesError}</p>
              {preselectedTemplate && (
                <p className="mt-1 text-xs">
                  The template you selected could not be loaded. Retry to use it, or cancel and try again.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={loadTemplates}
              className="shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Mode toggle — always shows blank + extract; shows template tab only when templates exist */}
      <div className={TAB_BAR}>
        <button
          type="button"
          onClick={() => { setMode('blank'); setSelectedTemplateId(null); setExtracted(null); setExtractedMeta(null); setUploadError(null) }}
          className={mode === 'blank' ? TAB_ACTIVE : TAB_INACTIVE}
        >
          From scratch
        </button>
        {hasTemplates && (
          <button
            type="button"
            onClick={() => { setMode('template'); setExtracted(null); setExtractedMeta(null); setUploadError(null) }}
            className={mode === 'template' ? TAB_ACTIVE : TAB_INACTIVE}
          >
            From template
          </button>
        )}
        <button
          type="button"
          onClick={() => { setMode('extract'); setSelectedTemplateId(null) }}
          className={mode === 'extract' ? TAB_ACTIVE : TAB_INACTIVE}
        >
          From PDF / image
        </button>
      </div>

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

      {/* Extract upload / preview */}
      {mode === 'extract' && !extracted && (
        <div className={`${CARD} ${CARD_PADDING} space-y-3`}>
          <div>
            <label htmlFor="ex-file" className={LABEL}>Upload a schedule</label>
            <p className={HELP_TEXT}>
              PDF, PNG, or JPG. Up to 10 MB. We&apos;ll extract a draft event you can review and edit
              before saving. Nothing is saved until you confirm.
            </p>
          </div>
          <input
            id="ex-file"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:text-white file:px-4 file:py-2 file:text-sm file:font-medium file:hover:bg-gray-700 disabled:opacity-60"
          />
          {uploading && <p className="text-sm text-gray-500">Extracting…</p>}
          {uploadError && <p className={ERROR_BANNER}>{uploadError}</p>}
        </div>
      )}

      {mode === 'extract' && extracted && (
        <ExtractionPreview
          initialEvent={extracted}
          submitting={submitting}
          error={error}
          onConfirm={handleExtractedConfirm}
          onDiscard={handleExtractedDiscard}
        />
      )}

      {/* Scratch / template shared form */}
      {mode !== 'extract' && (
        <form onSubmit={handleSubmit} className={`${CARD} ${CARD_PADDING} space-y-4`}>
          {/* Title */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="title" className={LABEL}>
                Title <span className="text-red-500">*</span>
              </label>
              <CharCounter used={title.length} max={FIELD_LIMITS.event.title} />
            </div>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Round 3 — Whilton Mill"
              required
              autoFocus
              maxLength={FIELD_LIMITS.event.title}
              className={INPUT}
            />
          </div>

          {/* Venue */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="venue" className={LABEL}>
                Venue
              </label>
              <CharCounter used={venue.length} max={FIELD_LIMITS.event.venue} />
            </div>
            <input
              id="venue"
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. Whilton Mill Karting"
              maxLength={FIELD_LIMITS.event.venue}
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
            <div className="flex items-center justify-between">
              <label htmlFor="notes" className={LABEL}>
                Notes{' '}
                <span className="text-xs text-gray-400 font-normal">(internal, not shown publicly)</span>
              </label>
              <CharCounter used={notes.length} max={FIELD_LIMITS.event.notes} />
            </div>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any internal notes about this event…"
              maxLength={FIELD_LIMITS.event.notes}
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
              disabled={submitting || (mode === 'template' && !selectedTemplateId) || Boolean(preselectedTemplate && templatesError)}
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
      )}
    </div>
  )
}
