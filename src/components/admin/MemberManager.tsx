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
import { H2, LIST_CARD, LIST_ROW, CARD, CARD_PADDING_COMPACT, LABEL_COMPACT, INPUT, BTN_PRIMARY, ERROR_BANNER, SUCCESS_BANNER } from '@/lib/styles'

interface MemberManagerProps {
  orgId: string
  initialMembers: Member[]
  initialInvites: Invite[]
}

type Member = {
  id: string
  user_id: string
  role: string
  email: string
  created_at: string
}

type Invite = {
  id: string
  email: string
  role: string
  created_at: string
}

const ROLES = ['owner', 'admin', 'editor', 'viewer'] as const
const INVITE_ROLES = ['admin', 'editor', 'viewer'] as const

export function MemberManager({ orgId, initialMembers, initialInvites }: MemberManagerProps) {
  // Initialise from server-fetched props so the list is visible immediately
  // on first paint. No empty state flash while the first async load completes.
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [invites, setInvites] = useState<Invite[]>(initialInvites)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('editor')

  // Skip the first-mount effect — data is fresh from the server.
  // Re-fetch only when orgId changes (org-switching).
  const isMounted = useRef(false)
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    loadData()
  }, [orgId])

  async function loadData() {
    try {
      const [membersResult, invitesResult] = await Promise.all([
        listOrgMembers(orgId),
        listOrgInvites(orgId),
      ])
      if (membersResult.success) setMembers(membersResult.data)
      if (invitesResult.success) setInvites(invitesResult.data)
    } catch {
      // Silently swallow — UI retains last-known state
    }
  }

  function clearMessages() {
    setError(null)
    setSuccess(null)
  }

  function handleRoleChange(memberId: string, newRole: string) {
    clearMessages()
    startTransition(async () => {
      const result = await updateMemberRole({
        memberId,
        orgId,
        newRole: newRole as 'owner' | 'admin' | 'editor' | 'viewer',
      })
      if (!result.success) {
        setError(result.error)
      } else {
        setSuccess('Role updated.')
        await loadData()
      }
    })
  }

  function handleRemove(memberId: string, email: string) {
    clearMessages()
    if (!confirm(`Remove ${email} from this organisation?`)) return
    startTransition(async () => {
      const result = await removeMember({ memberId, orgId })
      if (!result.success) {
        setError(result.error)
      } else {
        setSuccess('Member removed.')
        await loadData()
      }
    })
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    clearMessages()
    if (!inviteEmail.trim()) { setError('Email is required.'); return }
    startTransition(async () => {
      const result = await inviteMember({ orgId, email: inviteEmail, role: inviteRole })
      if (!result.success) {
        setError(result.error)
      } else {
        setSuccess(`Invite sent to ${inviteEmail}.`)
        setInviteEmail('')
        await loadData()
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
        await loadData()
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
                  className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
                >
                  {ROLES.map((r) => (
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
            <p className="px-4 py-3 text-sm text-gray-400">No members found.</p>
          )}
        </div>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div>
          <h3 className={`${H2} mb-3`}>Pending invites</h3>
          <div className={LIST_CARD}>
            {invites.map((invite) => (
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
            ))}
          </div>
        </div>
      )}

      {/* Invite form */}
      <div>
        <h3 className={`${H2} mb-3`}>Invite member</h3>
        <form onSubmit={handleInvite} className={`${CARD} ${CARD_PADDING_COMPACT}`}>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label htmlFor="invite-email" className={LABEL_COMPACT}>
                Email address
              </label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                required
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="invite-role" className={LABEL_COMPACT}>
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'editor' | 'viewer')}
                className="text-sm bg-gray-50 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                {INVITE_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={pending}
              className={`${BTN_PRIMARY} whitespace-nowrap`}
            >
              Send invite
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
