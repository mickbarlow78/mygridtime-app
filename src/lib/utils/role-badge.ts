// MGT-084 — Pure helper that maps the current session state onto a UserBadge.
//
// Resolution order (STRICT — the UI contract depends on this precedence):
//   1. platform admin    -> { kind: 'admin' }             — global, no org
//   2. platform staff    -> { kind: 'platform', role: 'staff',   orgName, orgId }
//      platform support  -> { kind: 'platform', role: 'support', orgName, orgId }
//      Access remains effective-owner via DEC-018 / get_user_org_role(), but the
//      badge MUST NOT render these users as 'Owner'.
//   3. real org member   -> { kind: 'org', role: 'owner' | 'editor', orgName, orgId }
//   4. no active org     -> { kind: 'subscription', level: 'member' | 'subscriber' }

import type { ActiveChampionship } from '@/lib/utils/active-championship'
import type { UserBadge } from '@/lib/types/roles'

export interface BadgeUser {
  platform_role: 'admin' | 'staff' | 'support' | null
  subscription_status: 'member' | 'subscriber'
}

export interface BadgeChampionship {
  championship_id: string
  championship_name: string
}

export function computeUserBadge(
  user: BadgeUser,
  activeChampionship: ActiveChampionship | null,
  activeChampionshipName: string | null
): UserBadge {
  if (user.platform_role === 'admin') {
    return { kind: 'admin' }
  }

  if (activeChampionship && activeChampionship.via === 'platform') {
    const role = (user.platform_role ?? activeChampionship.platform_role) as 'staff' | 'support' | null
    if (role === 'staff' || role === 'support') {
      return {
        kind: 'platform',
        role,
        orgName: activeChampionshipName ?? '',
        orgId: activeChampionship.championship_id,
      }
    }
  }

  if (activeChampionship && activeChampionship.via === 'membership') {
    if (activeChampionship.role === 'owner' || activeChampionship.role === 'editor') {
      return {
        kind: 'org',
        role: activeChampionship.role,
        orgName: activeChampionshipName ?? '',
        orgId: activeChampionship.championship_id,
      }
    }
  }

  return { kind: 'subscription', level: user.subscription_status }
}
