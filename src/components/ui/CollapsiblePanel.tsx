'use client'

import { useId, useState, type ReactNode } from 'react'
import { cn, TAP_TARGET } from '@/lib/styles'

type CollapsiblePanelProps = {
  title: string
  count?: number
  defaultOpen?: boolean
  /** Controlled open state. When provided, the panel becomes fully controlled. */
  open?: boolean
  /** Called with the next open state whenever the header is toggled. */
  onOpenChange?: (open: boolean) => void
  /** Optional node rendered to the right of the title, before the chevron. */
  rightSlot?: ReactNode
  children: ReactNode
}

export function CollapsiblePanel({
  title,
  count,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  rightSlot,
  children,
}: CollapsiblePanelProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const bodyId = useId()

  function handleToggle() {
    const next = !open
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  const showCount = typeof count === 'number' && count > 0

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid="collapsible-header"
        className={cn(
          'w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left',
          TAP_TARGET,
        )}
      >
        <span className="text-sm font-medium text-gray-700">
          {title}
          {showCount && (
            <span className="ml-2 text-xs text-gray-400">· {count} entries</span>
          )}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {rightSlot}
          <svg
            aria-hidden="true"
            className={cn(
              'w-4 h-4 text-gray-400 transition-transform duration-150',
              open && 'rotate-180',
            )}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </span>
      </button>

      <div id={bodyId} hidden={!open} data-testid="collapsible-body">
        {children}
      </div>
    </div>
  )
}
