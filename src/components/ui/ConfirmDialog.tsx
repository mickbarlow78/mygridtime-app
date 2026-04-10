'use client'

import { useEffect, useRef } from 'react'
import { CARD, BTN_SECONDARY, BTN_PRIMARY, BTN_DESTRUCTIVE } from '@/lib/styles'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  confirmDestructive?: boolean
  /** When true the confirm button is disabled (e.g. gated by an acknowledgement checkbox). */
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Optional extra content (e.g. extra form fields) rendered below description */
  children?: React.ReactNode
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmDestructive = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Trap focus inside dialog & close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-sm ${CARD} shadow-xl p-6`}
      >
        <h2 className="text-base font-semibold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 mb-4">{description}</p>

        {children && <div className="mb-4 space-y-3">{children}</div>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className={BTN_SECONDARY}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={confirmDestructive ? BTN_DESTRUCTIVE : BTN_PRIMARY}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
