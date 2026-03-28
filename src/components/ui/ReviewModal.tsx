'use client'

import { useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChangeCard =
  | { kind: 'meta-field';      id: string; label: string; from: string | null; to: string | null }
  | { kind: 'entry-added';     id: string; title: string; start_time: string; end_time: string | null; category: string | null; is_break: boolean }
  | { kind: 'entry-removed';   id: string; title: string; start_time: string; end_time: string | null; category: string | null }
  | { kind: 'entry-edited';    id: string; title: string; changes: Record<string, { from: unknown; to: unknown }> }
  | { kind: 'entry-reordered'; id: string; titles: string[] }

export type ReviewCard = ChangeCard & { status: 'pending' | 'rejected' }

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReviewModalProps {
  open: boolean
  title: string
  cards: ReviewCard[]
  saving: boolean
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onAcceptAll: () => void   // accepts all pending + triggers save immediately
  onConfirmSave: () => void // save with current decisions (all pending accepted)
  onCancel: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtVal(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return String(val)
}

function fmtTime(t: string | null | undefined): string {
  return t ?? '—'
}

function entryFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    title: 'Title', start_time: 'Start', end_time: 'End',
    category: 'Category', notes: 'Notes', is_break: 'Break',
  }
  return labels[field] ?? field
}

// ── Card renderers ────────────────────────────────────────────────────────────

function MetaFieldCard({ card }: { card: Extract<ReviewCard, { kind: 'meta-field' }> }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Field changed</p>
      <p className="text-base font-semibold text-gray-900">{card.label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-xs text-red-500 font-medium mb-1">Before</p>
          <p className="text-sm text-red-800 break-words">{fmtVal(card.from)}</p>
        </div>
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2">
          <p className="text-xs text-green-600 font-medium mb-1">After</p>
          <p className="text-sm text-green-800 break-words">{fmtVal(card.to)}</p>
        </div>
      </div>
    </div>
  )
}

function EntryAddedCard({ card }: { card: Extract<ReviewCard, { kind: 'entry-added' }> }) {
  const timeStr = card.end_time
    ? `${fmtTime(card.start_time)} – ${fmtTime(card.end_time)}`
    : fmtTime(card.start_time)
  return (
    <div className="space-y-3">
      <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
        New entry
      </span>
      <p className="text-base font-semibold text-gray-900">{card.title}</p>
      <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 space-y-1">
        <p className="text-sm text-gray-700">{timeStr}</p>
        {card.category && <p className="text-sm text-gray-500">Category: {card.category}</p>}
        {card.is_break && <p className="text-sm text-gray-500">Marked as break</p>}
      </div>
    </div>
  )
}

function EntryRemovedCard({ card }: { card: Extract<ReviewCard, { kind: 'entry-removed' }> }) {
  const timeStr = card.end_time
    ? `${fmtTime(card.start_time)} – ${fmtTime(card.end_time)}`
    : fmtTime(card.start_time)
  return (
    <div className="space-y-3">
      <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        Deletion
      </span>
      <p className="text-base font-semibold text-gray-900">{card.title}</p>
      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 space-y-1">
        <p className="text-sm text-gray-700">{timeStr}</p>
        {card.category && <p className="text-sm text-gray-500">Category: {card.category}</p>}
      </div>
    </div>
  )
}

function EntryEditedCard({ card }: { card: Extract<ReviewCard, { kind: 'entry-edited' }> }) {
  return (
    <div className="space-y-3">
      <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
        Edited
      </span>
      <p className="text-base font-semibold text-gray-900">{card.title}</p>
      <ul className="space-y-2">
        {Object.entries(card.changes).map(([field, change]) => (
          <li key={field} className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-xs text-red-500 font-medium mb-1">{entryFieldLabel(field)} — before</p>
              <p className="text-sm text-red-800 break-words">{fmtVal(change.from)}</p>
            </div>
            <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2">
              <p className="text-xs text-green-600 font-medium mb-1">{entryFieldLabel(field)} — after</p>
              <p className="text-sm text-green-800 break-words">{fmtVal(change.to)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EntryReorderedCard({ card }: { card: Extract<ReviewCard, { kind: 'entry-reordered' }> }) {
  return (
    <div className="space-y-3">
      <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
        Reorder
      </span>
      <p className="text-sm text-gray-500">
        {card.titles.length} entries repositioned. New order:
      </p>
      <ol className="space-y-1">
        {card.titles.map((t, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
            <span className="text-xs text-gray-400 w-5 text-right shrink-0">{i + 1}.</span>
            {t}
          </li>
        ))}
      </ol>
    </div>
  )
}

function CardContent({ card }: { card: ReviewCard }) {
  switch (card.kind) {
    case 'meta-field':      return <MetaFieldCard card={card} />
    case 'entry-added':     return <EntryAddedCard card={card} />
    case 'entry-removed':   return <EntryRemovedCard card={card} />
    case 'entry-edited':    return <EntryEditedCard card={card} />
    case 'entry-reordered': return <EntryReorderedCard card={card} />
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'pending' | 'rejected' }) {
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        ✕ Rejected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
      Pending
    </span>
  )
}

// ── Reject label helper ───────────────────────────────────────────────────────

function rejectLabel(kind: ChangeCard['kind']): string {
  if (kind === 'entry-removed')   return 'Restore entry'
  if (kind === 'entry-reordered') return 'Revert order'
  return 'Reject'
}

function acceptLabel(kind: ChangeCard['kind']): string {
  if (kind === 'entry-removed')   return 'Keep deletion'
  if (kind === 'entry-reordered') return 'Keep new order'
  return 'Accept'
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReviewModal({
  open, title, cards, saving,
  onAccept, onReject, onAcceptAll, onConfirmSave, onCancel,
}: ReviewModalProps) {
  const [index, setIndex] = useState(0)

  // Reset index when modal opens
  useEffect(() => { if (open) setIndex(0) }, [open])

  // Escape → cancel
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, saving, onCancel])

  if (!open) return null

  const total = cards.length
  const safeIndex = Math.min(index, Math.max(0, total - 1))
  const card = cards[safeIndex]

  const pendingCount  = cards.filter(c => c.status === 'pending').length
  const rejectedCount = cards.filter(c => c.status === 'rejected').length
  const allDecided    = total > 0 && pendingCount === 0

  function handleAccept(id: string) {
    onAccept(id)
    if (safeIndex < cards.length - 1) setIndex(safeIndex + 1)
  }

  function handleReject(id: string) {
    onReject(id)
    // cards.length may shrink (for entry-removed / entry-reordered)
    // index clamp in render handles that
    if (safeIndex < cards.length - 1) setIndex(safeIndex + 1)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onCancel() }}
    >
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">{title}</p>
          {total === 0 ? (
            <p className="text-sm text-gray-500">No changes to review.</p>
          ) : (
            <p className="text-sm text-gray-500">
              {pendingCount > 0
                ? `${pendingCount} pending${rejectedCount > 0 ? ` · ${rejectedCount} rejected` : ''}`
                : `${total - rejectedCount} accepted · ${rejectedCount} rejected`}
            </p>
          )}
        </div>

        {/* Card area */}
        <div className="px-6 py-5 min-h-[220px]">
          {total === 0 ? (
            <p className="text-sm text-gray-400 italic">Nothing has changed.</p>
          ) : card ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <StatusBadge status={card.status} />
                <span className="text-xs text-gray-400">{safeIndex + 1} of {total}</span>
              </div>
              <CardContent card={card} />
            </div>
          ) : null}
        </div>

        {/* Navigation */}
        {total > 1 && (
          <div className="px-6 pb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIndex(Math.max(0, safeIndex - 1))}
              disabled={safeIndex === 0 || saving}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => setIndex(Math.min(total - 1, safeIndex + 1))}
              disabled={safeIndex >= total - 1 || saving}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
          </div>
        )}

        {/* Accept / Reject for current card */}
        {card && (
          <div className="px-6 pb-4 flex items-center gap-2">
            {card.status === 'pending' ? (
              <>
                <button
                  type="button"
                  onClick={() => handleReject(card.id)}
                  disabled={saving}
                  className="flex-1 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-40 transition-colors"
                >
                  {rejectLabel(card.kind)}
                </button>
                <button
                  type="button"
                  onClick={() => handleAccept(card.id)}
                  disabled={saving}
                  className="flex-1 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 disabled:opacity-40 transition-colors"
                >
                  {acceptLabel(card.kind)}
                </button>
              </>
            ) : (
              /* Rejected card — show "Undo reject" for reversible types */
              card.kind !== 'entry-removed' && card.kind !== 'entry-reordered' ? (
                <button
                  type="button"
                  onClick={() => handleAccept(card.id)}
                  disabled={saving}
                  className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 disabled:opacity-40 transition-colors"
                >
                  Undo reject
                </button>
              ) : (
                <p className="flex-1 text-sm text-gray-400 text-center italic">Change reverted</p>
              )
            )}
          </div>
        )}

        {/* Footer: Accept All / Confirm Save / Cancel */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={onAcceptAll}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                Accept all &amp; save
              </button>
            )}
            {allDecided && (
              <button
                type="button"
                onClick={onConfirmSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                {saving
                  ? 'Saving…'
                  : rejectedCount > 0
                    ? `Save (${total - rejectedCount} of ${total})`
                    : 'Save'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
