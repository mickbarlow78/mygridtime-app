'use client'

import { useState, useTransition, useMemo, useEffect, useCallback } from 'react'
import { loadAuditLog } from '@/app/admin/audit/actions'
import type { AuditLogEntry } from '@/lib/audit'
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel'

interface ChampionshipAuditLogViewProps {
  entries: AuditLogEntry[]
  championshipId: string
  initialHasMore: boolean
  /**
   * If the server-side initial audit_log query failed, the page passes its
   * user-facing error message here. Seeds `loadError` so the Retry banner
   * renders on panel open, and flips `allLoaded` to false so the existing
   * `useEffect` calls `loadAll()` on open — either clearing the banner on
   * success or replacing it with the latest error.
   */
  initialLoadError?: string | null
  /**
   * Increments to force a reload of all audit entries. Parent bumps this
   * after a successful save so newly written rows appear without requiring
   * the panel to be closed and re-opened.
   */
  refreshSignal?: number
}

// ── Labels ──────────────────────────────────────────────────────────────────

const actionLabels: Record<string, string> = {
  'championship.created':          'Championship created',
  'championship.updated':          'Championship renamed',
  'championship.branding_updated': 'Branding updated',
  'org_member.invited':            'Invite sent',
  'org_member.invite_revoked':     'Invite revoked',
  'org_member.invite_accepted':    'Invite accepted',
  'org_member.role_updated':       'Role changed',
  'org_member.removed':            'Member removed',
}

const filterOptions: { value: string; label: string }[] = [
  { value: '',                               label: 'All actions' },
  { value: 'championship.created',           label: 'Championship created' },
  { value: 'championship.updated',           label: 'Championship renamed' },
  { value: 'championship.branding_updated',  label: 'Branding updated' },
  { value: 'org_member.invited',             label: 'Invite sent' },
  { value: 'org_member.invite_revoked',      label: 'Invite revoked' },
  { value: 'org_member.invite_accepted',     label: 'Invite accepted' },
  { value: 'org_member.role_updated',        label: 'Role changed' },
  { value: 'org_member.removed',             label: 'Member removed' },
]

const metaFieldLabels: Record<string, string> = {
  name:         'Name',
  slug:         'Slug',
  primaryColor: 'Primary color',
  logoUrl:      'Logo URL',
  headerText:   'Header text',
}

// ── Type guards ──────────────────────────────────────────────────────────────

type FieldChange = { from: unknown; to: unknown }
type MetaChangesDetail = { changes: Record<string, FieldChange> }
function isMetaChanges(d: unknown): d is MetaChangesDetail {
  return typeof d === 'object' && d !== null && 'changes' in d &&
    typeof (d as MetaChangesDetail).changes === 'object'
}

type MemberInvitedDetail   = { email?: string; role?: string }
type MemberRoleDetail      = { target_email?: string | null; changes?: { role?: { from?: string; to?: string } } }
type MemberRemovedDetail   = { target_email?: string | null; previous_role?: string }
type MemberInviteIdDetail  = { email?: string | null; invite_id?: string }
type ChampionshipCreatedDetail = { name?: string; slug?: string }

// ── Formatting helpers ───────────────────────────────────────────────────────

function fmtVal(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return `"${val}"`
}

function titleCaseRole(role: string | null | undefined): string {
  if (!role) return ''
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

function logoUrlSummary(from: unknown, to: unknown): string {
  const hadFrom = typeof from === 'string' && from.length > 0
  const hadTo = typeof to === 'string' && to.length > 0
  if (!hadFrom && hadTo) return 'set'
  if (hadFrom && !hadTo) return 'cleared'
  return 'updated'
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── CSV helpers ──────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatDetailForCsv(action: string, detail: unknown): string {
  if (typeof detail !== 'object' || detail === null) return ''
  const d = detail as Record<string, unknown>

  if (action === 'championship.created') {
    const { name, slug } = d as ChampionshipCreatedDetail
    if (!name) return ''
    return slug ? `Created "${name}" (slug: ${slug})` : `Created "${name}"`
  }

  if (action === 'championship.updated' && isMetaChanges(detail)) {
    const parts = Object.entries(detail.changes).map(([field, change]) => {
      const label = metaFieldLabels[field] ?? field
      return `${label}: ${fmtVal(change.from)} -> ${fmtVal(change.to)}`
    })
    return parts.join('; ')
  }

  if (action === 'championship.branding_updated' && isMetaChanges(detail)) {
    const parts = Object.entries(detail.changes).map(([field, change]) => {
      const label = metaFieldLabels[field] ?? field
      if (field === 'logoUrl') return `${label}: ${logoUrlSummary(change.from, change.to)}`
      return `${label}: ${fmtVal(change.from)} -> ${fmtVal(change.to)}`
    })
    return parts.join('; ')
  }

  if (action === 'org_member.invited') {
    const { email, role } = d as MemberInvitedDetail
    if (!email) return ''
    return role ? `Invited ${email} as ${titleCaseRole(role)}` : `Invited ${email}`
  }

  if (action === 'org_member.invite_revoked') {
    const { email } = d as MemberInviteIdDetail
    return email ? `Revoked invite for ${email}` : 'Revoked invite'
  }

  if (action === 'org_member.invite_accepted') {
    const { role } = d as { role?: string }
    return role ? `Accepted invite as ${titleCaseRole(role)}` : 'Accepted invite'
  }

  if (action === 'org_member.role_updated') {
    const { target_email, changes } = d as MemberRoleDetail
    const from = changes?.role?.from
    const to   = changes?.role?.to
    if (!from || !to) return ''
    const who = target_email ?? 'a member'
    return `${who}: ${titleCaseRole(from)} -> ${titleCaseRole(to)}`
  }

  if (action === 'org_member.removed') {
    const { target_email, previous_role } = d as MemberRemovedDetail
    const who = target_email ?? 'a member'
    return previous_role ? `Removed ${who} (was ${titleCaseRole(previous_role)})` : `Removed ${who}`
  }

  return ''
}

function entriesToCsv(entries: Array<{ created_at: string; action: string; user_email?: string | null; detail?: unknown }>): string {
  const header = ['Timestamp', 'Action', 'User', 'Summary', 'Detail']
  const rows = entries.map((e) => [
    e.created_at,
    actionLabels[e.action] ?? e.action,
    e.user_email ?? '',
    formatDetailForCsv(e.action, e.detail),
    e.detail ? JSON.stringify(e.detail) : '',
  ])
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Sub-renderers ────────────────────────────────────────────────────────────

function MetaDiff({ changes }: { changes: Record<string, FieldChange> }) {
  const entries = Object.entries(changes)
  if (entries.length === 0) return null
  return (
    <ul className="mt-2 space-y-0.5">
      {entries.map(([field, change]) => (
        <li key={field} className="text-xs">
          <span className="text-gray-400">{metaFieldLabels[field] ?? field}: </span>
          {field === 'logoUrl' ? (
            <span className="text-gray-700">{logoUrlSummary(change.from, change.to)}</span>
          ) : (
            <>
              <span className="text-red-500">{fmtVal(change.from)}</span>
              <span className="text-gray-400 mx-1">→</span>
              <span className="text-green-600">{fmtVal(change.to)}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

function ChampionshipCreatedSummary({ detail }: { detail: unknown }) {
  if (typeof detail !== 'object' || detail === null) return null
  const { name } = detail as ChampionshipCreatedDetail
  if (!name) return null
  return (
    <p className="mt-1 text-xs text-gray-500">
      Created <span className="text-gray-700">&quot;{name}&quot;</span>
    </p>
  )
}

function MemberActionSummary({ action, detail }: { action: string; detail: unknown }) {
  if (typeof detail !== 'object' || detail === null) return null
  const d = detail as Record<string, unknown>

  if (action === 'org_member.invited') {
    const { email, role } = d as MemberInvitedDetail
    if (!email) return null
    return (
      <p className="mt-1 text-xs text-gray-500">
        Invited <span className="text-gray-700">{email}</span>
        {role && <> as <span className="text-gray-700">{titleCaseRole(role)}</span></>}
      </p>
    )
  }

  if (action === 'org_member.invite_revoked') {
    const { email } = d as MemberInviteIdDetail
    return (
      <p className="mt-1 text-xs text-gray-500">
        Revoked invite{email ? <> for <span className="text-gray-700">{email}</span></> : ''}
      </p>
    )
  }

  if (action === 'org_member.invite_accepted') {
    const { role } = d as { role?: string }
    return (
      <p className="mt-1 text-xs text-gray-500">
        Accepted invite{role && <> as <span className="text-gray-700">{titleCaseRole(role)}</span></>}
      </p>
    )
  }

  if (action === 'org_member.role_updated') {
    const { target_email, changes } = d as MemberRoleDetail
    const from = changes?.role?.from
    const to   = changes?.role?.to
    if (!from || !to) return null
    const who = target_email ?? 'a member'
    return (
      <p className="mt-1 text-xs text-gray-500">
        <span className="text-gray-700">{who}</span>:{' '}
        <span className="text-red-500">{titleCaseRole(from)}</span>
        <span className="text-gray-400 mx-1">→</span>
        <span className="text-green-600">{titleCaseRole(to)}</span>
      </p>
    )
  }

  if (action === 'org_member.removed') {
    const { target_email, previous_role } = d as MemberRemovedDetail
    if (!target_email && !previous_role) return null
    return (
      <p className="mt-1 text-xs text-gray-500">
        Removed <span className="text-gray-700">{target_email ?? 'a member'}</span>
        {previous_role && <> (was <span className="text-gray-700">{titleCaseRole(previous_role)}</span>)</>}
      </p>
    )
  }

  return null
}

// ── Main component ───────────────────────────────────────────────────────────

export function ChampionshipAuditLogView({
  entries: initialEntries,
  championshipId,
  initialHasMore,
  initialLoadError = null,
  refreshSignal = 0,
}: ChampionshipAuditLogViewProps) {
  const [open, setOpen] = useState(false)
  const [allEntries, setAllEntries] = useState(initialEntries)
  const [loadingAll, startLoadingAll] = useTransition()
  const [allLoaded, setAllLoaded] = useState(!initialLoadError && !initialHasMore)
  const [capped, setCapped] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(initialLoadError ?? null)

  const [actionFilter, setActionFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const loadAll = useCallback(() => {
    setLoadError(null)
    startLoadingAll(async () => {
      const result = await loadAuditLog({ championshipId })
      if (result.success) {
        setAllEntries(result.data.entries)
        setCapped(result.data.capped)
        setAllLoaded(true)
      } else {
        setLoadError(result.error ?? 'Could not load audit log. Please retry.')
        setAllLoaded(true)
      }
    })
  }, [championshipId])

  useEffect(() => {
    if (open && !allLoaded && !loadingAll) {
      loadAll()
    }
  }, [open, allLoaded, loadingAll, loadAll])

  useEffect(() => {
    if (refreshSignal > 0) {
      setAllLoaded(false)
    }
  }, [refreshSignal])

  const filteredEntries = useMemo(() => {
    let result = allEntries

    if (actionFilter) {
      result = result.filter((e) => e.action === actionFilter)
    }

    if (dateFrom) {
      const from = new Date(dateFrom + 'T00:00:00')
      result = result.filter((e) => new Date(e.created_at) >= from)
    }

    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59.999')
      result = result.filter((e) => new Date(e.created_at) <= to)
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) => {
        const label = (actionLabels[e.action] ?? e.action).toLowerCase()
        const email = (e.user_email ?? '').toLowerCase()
        const detail = e.detail ? JSON.stringify(e.detail).toLowerCase() : ''
        return label.includes(q) || email.includes(q) || detail.includes(q)
      })
    }

    return result
  }, [allEntries, actionFilter, dateFrom, dateTo, searchQuery])

  function handleExportCsv() {
    const csv = entriesToCsv(filteredEntries)
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `championship-audit-log-${date}.csv`)
  }

  const controlsDisabled = loadingAll && !allLoaded

  return (
    <CollapsiblePanel
      title="Audit log"
      count={allEntries.length}
      open={open}
      onOpenChange={setOpen}
    >
      <div>
          {allEntries.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 space-y-2">
              <div className="flex flex-wrap gap-2">
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  disabled={controlsDisabled}
                  aria-label="Filter by action type"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                >
                  {filterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={controlsDisabled}
                  placeholder="Search logs..."
                  aria-label="Search audit log"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 min-w-[140px] flex-1 max-w-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-gray-500">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  disabled={controlsDisabled}
                  aria-label="Filter from date"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                />
                <label className="text-xs text-gray-500">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  disabled={controlsDisabled}
                  aria-label="Filter to date"
                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
                />
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={controlsDisabled || filteredEntries.length === 0}
                  className="ml-auto text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 border border-gray-200 rounded px-2 py-1 bg-white"
                >
                  Export CSV
                </button>
              </div>
            </div>
          )}

          {loadingAll && !loadError && (
            <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-100">
              Loading all entries...
            </div>
          )}

          {loadError && (
            <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-gray-100 flex items-center justify-between gap-2">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => {
                  setLoadError(null)
                  setAllLoaded(false)
                }}
                className="text-xs text-red-700 hover:text-red-900 underline shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {capped && (
            <div className="px-4 py-2 text-xs text-amber-600 bg-amber-50 border-b border-gray-100">
              Showing first 2,000 entries. Older entries are not included.
            </div>
          )}

          <div className="divide-y divide-gray-100">
            {filteredEntries.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">
                {actionFilter || searchQuery || dateFrom || dateTo
                  ? 'No entries match the current filters.'
                  : 'No audit entries yet.'}
              </p>
            ) : (
              filteredEntries.map((entry) => {
                const detail = entry.detail
                const isChampionshipMetaDiff =
                  (entry.action === 'championship.updated' ||
                   entry.action === 'championship.branding_updated') &&
                  isMetaChanges(detail)
                const isMemberAction = entry.action.startsWith('org_member.')

                return (
                  <div key={entry.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800">
                          {actionLabels[entry.action] ?? entry.action}
                        </p>
                        {entry.user_email && (
                          <p className="text-xs text-gray-400 mt-0.5">{entry.user_email}</p>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 whitespace-nowrap shrink-0 mt-0.5">
                        {formatTimestamp(entry.created_at)}
                      </p>
                    </div>

                    {entry.action === 'championship.created' && <ChampionshipCreatedSummary detail={detail} />}
                    {isChampionshipMetaDiff && <MetaDiff changes={(detail as MetaChangesDetail).changes} />}
                    {isMemberAction && <MemberActionSummary action={entry.action} detail={detail} />}
                  </div>
                )
              })
            )}
          </div>
        </div>
    </CollapsiblePanel>
  )
}
