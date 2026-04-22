'use client'

// MGT-084 — Header role badge + user menu popover.
//
// Renders a compact role pill (priority: admin → platform staff/support →
// org owner/editor → subscription subscriber/member) and, on click, a
// popover showing name, email, role, subscription, the list of orgs the
// user belongs to (click to switch), and a Sign out button.
//
// The badge derivation lives in `computeUserBadge()` — this component is
// purely presentational over that pre-computed `UserBadge`.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { switchOrg } from '@/app/admin/orgs/actions'
import { signOut } from '@/app/admin/actions'
import type { UserBadge } from '@/lib/types/roles'
import type { UserOrg } from '@/lib/utils/active-org'

interface UserMenuProps {
  badge: UserBadge
  userEmail: string
  userDisplayName: string | null
  subscriptionStatus: 'member' | 'subscriber'
  userOrgs: UserOrg[]
  activeOrgId: string | null
}

// Tailwind classes keyed by badge kind / role. Kept inline rather than
// plumbed through `styles.ts` because the variants are tightly coupled to
// this component and are not reused elsewhere.
const BADGE_CLASS: Record<string, string> = {
  admin:      'bg-slate-900 text-white',
  staff:      'bg-purple-700 text-white',
  support:    'bg-indigo-600 text-white',
  owner:      'bg-gray-900 text-white',
  editor:     'bg-blue-600 text-white',
  subscriber: 'bg-emerald-600 text-white',
  member:     'bg-gray-500 text-white',
}

function badgeLabel(badge: UserBadge): { label: string; classKey: string } {
  switch (badge.kind) {
    case 'admin':
      return { label: 'Admin', classKey: 'admin' }
    case 'platform':
      return {
        label: `${badge.role === 'staff' ? 'Staff' : 'Support'} — ${badge.orgName || 'Org'}`,
        classKey: badge.role,
      }
    case 'org':
      return {
        label: `${badge.role === 'owner' ? 'Owner' : 'Editor'} — ${badge.orgName || 'Org'}`,
        classKey: badge.role,
      }
    case 'subscription':
      return {
        label: badge.level === 'subscriber' ? 'Subscriber' : 'Member',
        classKey: badge.level,
      }
  }
}

function roleLineText(badge: UserBadge): string {
  switch (badge.kind) {
    case 'admin':
      return 'Admin'
    case 'platform':
      return badge.role === 'staff' ? 'Staff' : 'Support'
    case 'org':
      return badge.role === 'owner' ? 'Owner' : 'Editor'
    case 'subscription':
      return '—'
  }
}

export function UserMenu({
  badge,
  userEmail,
  userDisplayName,
  subscriptionStatus,
  userOrgs,
  activeOrgId,
}: UserMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function handleSwitchOrg(orgId: string) {
    if (orgId === activeOrgId) {
      setOpen(false)
      return
    }
    startTransition(async () => {
      await switchOrg(orgId)
      setOpen(false)
      router.refresh()
    })
  }

  const { label, classKey } = badgeLabel(badge)
  const displayName =
    (userDisplayName && userDisplayName.trim()) ||
    userEmail.split('@')[0] ||
    userEmail

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`text-xs font-medium rounded-full px-3 py-2 sm:py-1 min-h-[40px] sm:min-h-0 inline-flex items-center transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400 max-w-[240px] truncate ${BADGE_CLASS[classKey]}`}
      >
        {label}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-md shadow-lg z-50"
        >
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
            <p className="text-xs text-gray-500 truncate">{userEmail}</p>
          </div>

          <dl className="px-4 py-3 space-y-2 text-xs border-b border-gray-100">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Role</dt>
              <dd className="text-gray-900 font-medium text-right truncate">{roleLineText(badge)}</dd>
            </div>
            {badge.kind === 'subscription' && (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Subscription</dt>
                <dd className="text-gray-900 font-medium">
                  {subscriptionStatus === 'subscriber' ? 'Subscriber' : 'Member'}
                </dd>
              </div>
            )}
          </dl>

          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
              Organisations
            </p>
            {userOrgs.length === 0 ? (
              <div className="text-xs text-gray-500 space-y-2">
                <p>You do not belong to any organisation yet.</p>
                <Link
                  href="/admin/orgs/new"
                  onClick={() => setOpen(false)}
                  className="text-gray-700 hover:text-gray-900 underline underline-offset-2"
                >
                  Create an organisation
                </Link>
              </div>
            ) : (
              <ul className="space-y-1">
                {userOrgs.map((o) => (
                  <li key={o.org_id}>
                    <button
                      type="button"
                      onClick={() => handleSwitchOrg(o.org_id)}
                      disabled={pending}
                      className={`w-full text-left text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 ${
                        o.org_id === activeOrgId
                          ? 'bg-gray-100 text-gray-900 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="truncate block">{o.org_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form action={signOut} className="px-4 py-3">
            <button
              type="submit"
              className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
