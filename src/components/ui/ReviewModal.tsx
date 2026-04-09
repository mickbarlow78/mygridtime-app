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
  onAcceptAll: () => void
  onConfirmSave: () => void
  /** Called when the user accepts the final (or only) card while it is rejected —
   *  parent must un-reject that id AND save inline without relying on async state. */
  onAcceptAndSave: (id: string) => void
  onCancel: () => void
  /** Optional content rendered in the footer, above the action buttons */
  footerExtra?: React.ReactNode
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

// ── Shared sub-components ─────────────────────────────────────────────────────

/** Tiny uppercase section label */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{children}</p>
}

/** Calm before/after pair — neutral grey vs soft blue */
function BeforeAfter({ field, from, to }: { field?: string; from: unknown; to: unknown }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          {field ? `${field} — was` : 'Was'}
        </p>
        <div className="bg-gray-50 rounded-lg px-3 py-2.5">
          <p className="text-sm text-gray-500 break-words">{fmtVal(from)}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-sky-500 uppercase tracking-wide">
          {field ? `${field} — now` : 'Now'}
        </p>
        <div className="bg-sky-50 rounded-lg px-3 py-2.5">
          <p className="text-sm text-gray-800 break-words">{fmtVal(to)}</p>
        </div>
      </div>
    </div>
  )
}

/** Simple detail pill for entry summaries */
function DetailLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500">{children}</p>
}

// ── Card renderers ────────────────────────────────────────────────────────────

function MetaFieldCard({ card }: { card: Extract<ReviewCard, { kind: 'meta-field' }> }) {
  return (
    <div className="space-y-3">
      <Eyebrow>Field changed</Eyebrow>
      <p className="text-base font-semibold text-gray-900">{card.label}</p>
      <BeforeAfter from={card.from} to={card.to} />
    </div>
  )
}

function EntryAddedCard({ card }: { card: Extract<ReviewCard, { kind: 'entry-added' }> }) {
  const timeStr = card.end_time
    ? `${fmtTime(card.start_time)} – ${fmtTime(card.end_time)}`
    : fmtTime(card.start_time)
  return (
    <div className="space-y-3">
      <Eyebrow>New entry</Eyebrow>
      <p className="text-base font-semibold text-gray-900">{card.title}</p>
      <div className="bg-sky-50 rounded-lg px-3 py-2.5 space-y-1">
        <DetailLine>{timeStr}</DetailLine>
        {card.category && <DetailLine>Category: {card.category}</DetailLine>}
        {card.is_break  && <DetailLine>Marked as break</DetailLine>}
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
      <Eyebrow>Deletion</Eyebrow>
      <p className="text-base font-semibold text-gray-900">{card.title}</p>
      <div className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-1">
        <DetailLine>{timeStr}</DetailLine>
        {card.category && <DetailLine>Category: {card.category}</DetailLine>}
      </div>
    </div>
  )
}

function EntryEditedCard({ card }: { card: Extract<ReviewCard, { kind: 'entry-edited' }> }) {
  return (
    <div className="space-y-3">
      <Eyebrow>Edited</Eyebrow>
      <p className="text-base font-semibold text-gray-900">{card.title}</p>
      <ul className="space-y-3">
        {Object.entries(card.changes).map(([field, change]) => (
          <li key={field}>
            <BeforeAfter field={entryFieldLabel(field)} from={change.from} to={change.to} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function EntryReorderedCard({ card }: { card: Extract<ReviewCard, { kind: 'entry-reordered' }> }) {
  return (
    <div className="space-y-3">
      <Eyebrow>Reorder</Eyebrow>
      <p className="text-sm text-gray-500">
        {card.titles.length} entries repositioned. New order:
      </p>
      <ol className="space-y-1.5 pl-1">
        {card.titles.map((t, i) => (
          <li key={i} className="flex items-baseline gap-2.5 text-sm text-gray-700">
            <span className="text-[11px] text-gray-400 w-4 text-right shrink-0 tabular-nums">{i + 1}.</span>
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

// ── Reject label helpers ──────────────────────────────────────────────────────

function rejectLabel(kind: ChangeCard['kind']): string {
  if (kind === 'entry-removed')   return 'Restore entry'
  if (kind === 'entry-reordered') return 'Revert order'
  return 'Skip'
}

function acceptLabel(kind: ChangeCard['kind']): string {
  if (kind === 'entry-removed')   return 'Keep deletion'
  if (kind === 'entry-reordered') return 'Keep new order'
  return 'Accept'
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReviewModal({
  open, title, cards, saving,
  onAccept, onReject, onAcceptAll, onConfirmSave, onAcceptAndSave, onCancel,
  footerExtra,
}: ReviewModalProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => { if (open) setIndex(0) }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, saving, onCancel])

  if (!open) return null

  const total        = cards.length
  const safeIndex    = Math.min(index, Math.max(0, total - 1))
  const card         = cards[safeIndex]
  const pendingCount  = cards.filter(c => c.status === 'pending').length
  const rejectedCount = cards.filter(c => c.status === 'rejected').length
  const allDecided    = total > 0 && pendingCount === 0
  const isLastCard    = total > 0 && safeIndex === total - 1

  function handleAccept(id: string) {
    onAccept(id)
    if (safeIndex < cards.length - 1) setIndex(safeIndex + 1)
  }

  function handleReject(id: string) {
    onReject(id)
    if (safeIndex < cards.length - 1) setIndex(safeIndex + 1)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onCancel() }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 pt-5 pb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">{title}</p>
          {total === 0 ? (
            <p className="text-sm text-gray-400">Nothing to review.</p>
          ) : (
            <p className="text-sm text-gray-500">
              {allDecided
                ? rejectedCount > 0
                  ? `${total - rejectedCount} accepted · ${rejectedCount} skipped`
                  : 'All changes accepted'
                : `${safeIndex + 1} of ${total}${rejectedCount > 0 ? ` · ${rejectedCount} skipped` : ''}`}
            </p>
          )}
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="mx-6 mb-4 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-900 rounded-full transition-all duration-300"
              style={{ width: `${((safeIndex + 1) / total) * 100}%` }}
            />
          </div>
        )}

        {/* Card area */}
        <div className="px-6 pb-5 min-h-[200px]">
          {total === 0 ? (
            <p className="text-sm text-gray-400 italic">Nothing has changed.</p>
          ) : card ? (
            <div className={card.status === 'rejected' ? 'opacity-50' : ''}>
              <CardContent card={card} />
              {card.status === 'rejected' && (
                <p className="mt-3 text-xs text-gray-400">This change will be skipped on save.</p>
              )}
            </div>
          ) : null}
        </div>

        {/* Per-card Accept / Skip row */}
        {card && (
          <div className="px-6 pb-4 flex items-center gap-2">
            {card.status === 'pending' ? (
              <>
                {/* Skip — secondary outline */}
                <button
                  type="button"
                  onClick={() => handleReject(card.id)}
                  disabled={saving}
                  className="flex-1 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  {rejectLabel(card.kind)}
                </button>
                {/* Accept (or Accept & save on last card) — primary solid */}
                <button
                  type="button"
                  onClick={() => isLastCard ? onConfirmSave() : handleAccept(card.id)}
                  disabled={saving}
                  className="flex-1 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >
                  {isLastCard ? acceptLabel(card.kind).replace('Accept', 'Accept & save') : acceptLabel(card.kind)}
                </button>
              </>
            ) : (
              card.kind !== 'entry-removed' && card.kind !== 'entry-reordered' ? (
                <button
                  type="button"
                  onClick={() => isLastCard ? onAcceptAndSave(card.id) : handleAccept(card.id)}
                  disabled={saving}
                  className="flex-1 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  {isLastCard ? 'Undo skip & save' : 'Undo skip'}
                </button>
              ) : (
                <p className="flex-1 text-sm text-gray-400 text-center">Change reverted</p>
              )
            )}
          </div>
        )}

        {/* Navigation */}
        {total > 1 && (
          <div className="px-6 pb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIndex(Math.max(0, safeIndex - 1))}
              disabled={safeIndex === 0 || saving}
              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => setIndex(Math.min(total - 1, safeIndex + 1))}
              disabled={safeIndex >= total - 1 || saving}
              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 space-y-3">
          {footerExtra}
          <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-sm text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={onAcceptAll}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                Accept all &amp; save
              </button>
            )}
            {allDecided && (
              <button
                type="button"
                onClick={onConfirmSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                {saving
                  ? 'Saving…'
                  : rejectedCount > 0
                    ? `Save ${total - rejectedCount} of ${total}`
                    : 'Save'}
              </button>
            )}
          </div>
          </div>
        </div>

      </div>
    </div>
  )
}
