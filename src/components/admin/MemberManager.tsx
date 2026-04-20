'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import {
  listOrgMembers,
  listOrgInvites,
  updateMemberRole,
  removeMember,
  inviteMember,
  revokeInvite,
} from '@/app/admin/orgs/actions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { H2, LIST_CARD, LIST_ROW, CARD, CARD_PADDING_COMPACT, LABEL_COMPACT, INPUT, BTN_PRIMARY, ERROR_BANNER, SUCCESS_BANNER } from '@/lib/styles'
import { FIELD_LIMITS } from '@/lib/constants/field-limits'
import { CharCounter } from '@/components/ui/CharCounter'

interface MemberManagerProps {
  orgId: string
  initialMembers: Member[]
  initialInvites: Invite[]
  onSaved?: () => void
}

export type Member = {
  id: string
  user_id: string
  role: string
  email: string
  created_at: string
}

export type Invite = {
  id: string
  email: string
  role: string
  created_at: string
}

// MGT-084: org role model collapsed to owner + editor. The 20260420010000
// migration rewrote all admin→editor and deleted viewer rows, and CHECK
// constraints now prevent any other value from reappearing.
const SELECTABLE_ROLES = ['owner', 'editor'] as const

export function MemberManager({ orgId, initialMembers, initialInvites, onSaved }: MemberManagerProps) {
  // Initialise from server-fetched props so the list is visible immediately
  // on first paint. No empty state flash while the first async load completes.
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [invites, setInvites] = useState<Invite[]>(initialInvites)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Confirm dialog state for member removal
  const [removeTarget, setRemoveTarget] = useState<{ memberId: string; email: string } | null>(null)

  // Confirm dialog state for role changes
  const [roleChangeTarget, setRoleChangeTarget] = useState<{
    memberId: string
    email: string
    currentRole: string
    newRole: 'owner' | 'editor'
  } | null>(null)

  // Invite form state
  // MGT-084: invites only create editors. Owners are only created via
  // createOrganisation. The UI shows role as a read-only display.
  const [inviteEmail, setInviteEmail] = useState('')

  // Skip the first-mount effect — data is fresh from the server.
  // Re-fetch only when orgId changes (org-switching).
  const isMounted = useRef(false)
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    loadData().then((r) => {
      if (!r.success) setError(`Could not load members: ${r.error}`)
    })
  }, [orgId])

  async function loadData(): Promise<{ success: true } | { success: false; error: string }> {
    try {
      const [membersResult, invitesResult] = await Promise.all([
        listOrgMembers(orgId),
        listOrgInvites(orgId),
      ])
      if (!membersResult.success) return { success: false, error: membersResult.error }
      if (!invitesResult.success) return { success: false, error: invitesResult.error }
      setMembers(membersResult.data)
      setInvites(invitesResult.data)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh members.'
      return { success: false, error: message }
    }
  }

  function clearMessages() {
    setError(null)
    setSuccess(null)
  }

  function handleRoleChange(memberId: string, newRole: string) {
    clearMessages()
    const member = members.find((m) => m.id === memberId)
    if (!member) return
    if (member.role === newRole) return
    if (newRole !== 'owner' && newRole !== 'editor') return
    setRoleChangeTarget({
      memberId,
      email: member.email,
      currentRole: member.role,
      newRole,
    })
  }

  function cancelRoleChange() {
    // The <select> is controlled via value={member.role}, so React's next render
    // will snap the displayed option back to the current (unchanged) role.
    setRoleChangeTarget(null)
  }

  function confirmRoleChange() {
    if (!roleChangeTarget) return
    const { memberId, newRole } = roleChangeTarget
    setRoleChangeTarget(null)
    startTransition(async () => {
      const result = await updateMemberRole({
        memberId,
        orgId,
        newRole,
      })
      if (!result.success) {
        setError(result.error)
      } else {
        setSuccess('Role updated.')
        const refresh = await loadData()
        if (!refresh.success) {
          setError(`Role updated, but the member list could not be refreshed: ${refresh.error}`)
        }
        onSaved?.()
      }
    })
  }

  function handleRemove(memberId: string, email: string) {
    clearMessages()
    setRemoveTarget({ memberId, email })
  }

  function confirmRemove() {
    if (!removeTarget) return
    const { memberId } = removeTarget
    setRemoveTarget(null)
    startTransition(async () => {
      const result = await removeMember({ memberId, orgId })
      if (!result.success) {
        setError(result.error)
      } else {
        setSuccess('Member removed.')
        const refresh = await loadData()
        if (!refresh.success) {
          setError(`Member removed, but the member list could not be refreshed: ${refresh.error}`)
        }
        onSaved?.()
      }
    })
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    clearMessages()
    if (!inviteEmail.trim()) { setError('Email is required.'); return }
    startTransition(async () => {
      const result = await inviteMember({ orgId, email: inviteEmail, role: 'editor' })
      if (!result.success) {
        setError(result.error)
      } else {
        setSuccess(`Invite sent to ${inviteEmail}.`)
        setInviteEmail('')
        const refresh = await loadData()
        if (!refresh.success) {
          setError(`Invite sent, but the invite list could not be refreshed: ${refresh.error}`)
        }
        onSaved?.()
      }
    })
  }

  function handleRevokeInvite(inviteId: string) {
    clearMessages()
    startTransition(async () => {
      const result = await revokeInvite({ inviteId, orgId })
      if (!result.success) {
        setError(result.error)
      } else {
        setSuccess('Invite revoked.')
        const refresh = await loadData()
        if (!refresh.success) {
          setError(`Invite revoked, but the invite list could not be refreshed: ${refresh.error}`)
        }
        onSaved?.()
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Messages */}
      {error && (
        <p className={ERROR_BANNER}>{error}</p>
      )}
      {success && (
        <p className={SUCCESS_BANNER}>{success}</p>
      )}

      {/* Members table */}
      <div>
        <h3 className={`${H2} mb-3`}>Members</h3>
        <div className={LIST_CARD}>
          {members.map((member) => (
            <div key={member.id} className={LIST_ROW}>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">{member.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Joined {new Date(member.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.id, e.target.value)}
                  disabled={pending}
                  aria-label={`Role for ${member.email}`}
                  className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
                >
                  {SELECTABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleRemove(member.id, member.email)}
                  disabled={pending}
                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                  title="Remove member"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">
              No members yet. Use the form below to invite people to this organisation.
            </p>
          )}
        </div>
      </div>

      {/* Pending invites */}
      <div>
        <h3 className={`${H2} mb-3`}>Pending invites</h3>
        <div className={LIST_CARD}>
          {invites.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">
              No pending invites. Invites you send will appear here until accepted.
            </p>
          ) : (
            invites.map((invite) => (
              <div key={invite.id} className={LIST_ROW}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{invite.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Invited as {invite.role} on {new Date(invite.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRevokeInvite(invite.id)}
                  disabled={pending}
                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors ml-3"
                >
                  Revoke
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Invite form */}
      <div>
        <h3 className={`${H2} mb-3`}>Invite member</h3>
        <form onSubmit={handleInvite} className={`${CARD} ${CARD_PADDING_COMPACT}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <label htmlFor="invite-email" className={LABEL_COMPACT}>
                  Email address
                </label>
                <CharCounter used={inviteEmail.length} max={FIELD_LIMITS.org.inviteEmail} />
              </div>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                required
                maxLength={FIELD_LIMITS.org.inviteEmail}
                className={INPUT}
              />
            </div>
            <div>
              <span className={LABEL_COMPACT}>Role</span>
              <p
                className="text-sm bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-gray-900 w-full sm:w-auto"
                aria-label="Invite role"
              >
                editor
              </p>
            </div>
            <button
              type="submit"
              disabled={pending}
              className={`${BTN_PRIMARY} whitespace-nowrap w-full sm:w-auto`}
            >
              Send invite
            </button>
          </div>
        </form>
      </div>

      {/* Remove member confirmation dialog */}
      <ConfirmDialog
        open={!!removeTarget}
        title="Remove member"
        description={`Remove ${removeTarget?.email ?? ''} from this organisation? They will lose access immediately.`}
        confirmLabel="Remove"
        confirmDestructive
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      {/* Role change confirmation dialog */}
      <ConfirmDialog
        open={!!roleChangeTarget}
        title="Change role"
        description={
          roleChangeTarget
            ? isDowngrade(roleChangeTarget.currentRole, roleChangeTarget.newRole)
              ? `Downgrade ${roleChangeTarget.email} from ${roleChangeTarget.currentRole} to ${roleChangeTarget.newRole}? They will immediately lose any permissions not granted to the ${roleChangeTarget.newRole} role.`
              : `Change ${roleChangeTarget.email} from ${roleChangeTarget.currentRole} to ${roleChangeTarget.newRole}? This takes effect immediately.`
            : ''
        }
        confirmLabel="Change role"
        confirmDestructive={
          roleChangeTarget ? isDowngrade(roleChangeTarget.currentRole, roleChangeTarget.newRole) : false
        }
        onConfirm={confirmRoleChange}
        onCancel={cancelRoleChange}
      />
    </div>
  )
}

// Role privilege ordering — used to classify downgrades for dialog wording
const ROLE_RANK: Record<string, number> = { owner: 2, editor: 1 }
function isDowngrade(current: string, next: string): boolean {
  return (ROLE_RANK[next] ?? 0) < (ROLE_RANK[current] ?? 0)
}
