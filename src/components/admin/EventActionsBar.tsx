'use client'

import { StatusBadge } from '@/components/ui/StatusBadge'
import { cn, CARD, BTN_PRIMARY_SM, BTN_SECONDARY_SM, SUCCESS_BANNER, TAP_TARGET } from '@/lib/styles'
import type { Event } from '@/lib/types/database'

interface EventActionsBarProps {
  status: Event['status']
  /** Absolute or relative public URL for the event, or null when no slug exists yet. */
  publicHref: string | null
  isDirty?: boolean
  /** MGT-096: unified save. When `onSave` is provided, the action bar renders
   *  a single primary "Save changes" button and its status slot. */
  onSave?: () => void
  saving?: boolean
  saveSuccess?: boolean
  saveError?: string | null
  onPublish: () => void
  onUnpublish: () => void
  onArchive: () => void
  onDuplicate: () => void
  onSaveTemplate: () => void
}

const STATUS_HINT: Record<Event['status'], string> = {
  draft: 'Not yet visible to the public.',
  published: 'Publicly visible.',
  archived: 'Archived — hidden from your dashboard.',
}

/**
 * Lifecycle action strip for the event editor. Sits above the Event details
 * card and owns the publish / unpublish / archive / duplicate / template
 * actions so the details card itself is only about editing metadata.
 *
 * MGT-096: also owns the single unified "Save changes" button when `onSave` is
 * passed — the editor's sole save entry point for metadata + timetable combined.
 */
export function EventActionsBar({
  status,
  publicHref,
  isDirty,
  onSave,
  saving = false,
  saveSuccess = false,
  saveError = null,
  onPublish,
  onUnpublish,
  onArchive,
  onDuplicate,
  onSaveTemplate,
}: EventActionsBarProps) {
  const canSave = !!onSave && !!isDirty && !saving

  return (
    <section
      className={cn(
        CARD,
        'px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <StatusBadge status={status} />
        <span className="text-xs text-gray-500 truncate max-w-[200px] sm:max-w-none">{STATUS_HINT[status]}</span>
        {isDirty && (
          <span
            className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 whitespace-nowrap"
            role="status"
            aria-live="polite"
          >
            Unsaved changes
          </span>
        )}
        {saveSuccess && !isDirty && (
          <span className={cn(SUCCESS_BANNER, 'py-0.5')} role="status" aria-live="polite">
            Changes saved.
          </span>
        )}
        {saveError && (
          <span className="text-xs text-red-600" role="alert">{saveError}</span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Unified save — primary entry point for metadata + timetable commit. */}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            aria-busy={saving}
            className={cn(BTN_PRIMARY_SM, TAP_TARGET, 'disabled:opacity-50 disabled:cursor-not-allowed')}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}

        {/* Publish / view public — status-dependent primary slot */}
        {status === 'draft' && (
          <button
            type="button"
            onClick={onPublish}
            className={cn(BTN_PRIMARY_SM, TAP_TARGET, 'bg-green-600 hover:bg-green-700')}
          >
            Publish
          </button>
        )}
        {status === 'published' && publicHref && (
          <a
            href={publicHref}
            target="_blank"
            rel="noreferrer"
            className={cn(BTN_PRIMARY_SM, TAP_TARGET)}
          >
            View public page
          </a>
        )}

        {/* Secondary cluster */}
        {status === 'published' && (
          <button type="button" onClick={onUnpublish} className={cn(BTN_SECONDARY_SM, TAP_TARGET)}>
            Unpublish
          </button>
        )}
        {status !== 'archived' && (
          <button type="button" onClick={onArchive} className={cn(BTN_SECONDARY_SM, TAP_TARGET)}>
            Archive
          </button>
        )}
        <button type="button" onClick={onDuplicate} className={cn(BTN_SECONDARY_SM, TAP_TARGET)}>
          Duplicate
        </button>
        <button type="button" onClick={onSaveTemplate} className={cn(BTN_SECONDARY_SM, TAP_TARGET)}>
          Save as Template
        </button>
      </div>
    </section>
  )
}
