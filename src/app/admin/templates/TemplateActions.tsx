'use client'

import { useState } from 'react'
import Link from 'next/link'
import { deleteTemplate } from './actions'
import type { TemplateSummary } from './actions'
import { formatDate } from '@/lib/utils/slug'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LIST_CARD, BTN_GHOST_SM, BTN_PRIMARY_SM } from '@/lib/styles'

interface TemplateActionsProps {
  templates: TemplateSummary[]
}

export function TemplateActions({ templates: initial }: TemplateActionsProps) {
  const [templates, setTemplates] = useState(initial)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const templateToDelete = deleteId ? templates.find((t) => t.id === deleteId) : null

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    setDeleteError(null)
    const result = await deleteTemplate(deleteId)
    setDeleting(false)
    if (result.success) {
      setTemplates((prev) => prev.filter((t) => t.id !== deleteId))
      setDeleteId(null)
    } else {
      // Keep the dialog open so the user sees the failure inline; do not
      // mutate local template state — the row is still in the DB.
      setDeleteError(result.error)
    }
  }

  function handleCancelDelete() {
    setDeleteId(null)
    setDeleteError(null)
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-base mb-2">No templates yet.</p>
        <p className="text-sm">
          Open an event in the editor and use &ldquo;Save as template&rdquo; to create one.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className={LIST_CARD}>
        {templates.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between px-6 py-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {t.day_count} {t.day_count === 1 ? 'day' : 'days'}
                {' · '}
                Created {formatDate(t.created_at.slice(0, 10))}
              </p>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              <Link
                href={`/admin/events/new?template=${t.id}`}
                className={BTN_PRIMARY_SM}
              >
                Use template
              </Link>
              <button
                type="button"
                onClick={() => setDeleteId(t.id)}
                className={`${BTN_GHOST_SM} text-red-500 hover:text-red-700`}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete template"
        description={`Are you sure you want to delete "${templateToDelete?.name ?? ''}"? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        confirmDestructive
        confirmDisabled={deleting}
        onConfirm={handleDelete}
        onCancel={handleCancelDelete}
      >
        {deleteError && (
          <p className="text-sm text-red-600">{deleteError}</p>
        )}
      </ConfirmDialog>
    </>
  )
}
