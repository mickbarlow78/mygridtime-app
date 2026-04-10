'use client'

import { StatusBadge } from '@/components/ui/StatusBadge'
import { cn, CARD, BTN_PRIMARY_SM, BTN_SECONDARY_SM } from '@/lib/styles'
import type { Event } from '@/lib/types/database'

interface EventActionsBarProps {
  status: Event['status']
  /** Absolute or relative public URL for the event, or null when no slug exists yet. */
  publicHref: string | null
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
 */
export function EventActionsBar({
  status,
  publicHref,
  onPublish,
  onUnpublish,
  onArchive,
  onDuplicate,
  onSaveTemplate,
}: EventActionsBarProps) {
  return (
    <section
      className={cn(
        CARD,
        'px-4 py-3 flex items-center justify-between gap-3 flex-wrap',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusBadge status={status} />
        <span className="text-xs text-gray-500 truncate">{STATUS_HINT[status]}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-end">
        {/* Primary slot */}
        {status === 'draft' && (
          <button
            type="button"
            onClick={onPublish}
            className={cn(BTN_PRIMARY_SM, 'bg-green-600 hover:bg-green-700')}
          >
            Publish
          </button>
        )}
        {status === 'published' && publicHref && (
          <a
            href={publicHref}
            target="_blank"
            rel="noreferrer"
            className={BTN_PRIMARY_SM}
          >
            View public page
          </a>
        )}

        {/* Secondary cluster */}
        {status === 'published' && (
          <button type="button" onClick={onUnpublish} className={BTN_SECONDARY_SM}>
            Unpublish
          </button>
        )}
        {status !== 'archived' && (
          <button type="button" onClick={onArchive} className={BTN_SECONDARY_SM}>
            Archive
          </button>
        )}
        <button type="button" onClick={onDuplicate} className={BTN_SECONDARY_SM}>
          Duplicate
        </button>
        <button type="button" onClick={onSaveTemplate} className={BTN_SECONDARY_SM}>
          Save as Template
        </button>
      </div>
    </section>
  )
}
