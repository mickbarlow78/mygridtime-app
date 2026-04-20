import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, OrgMemberRole, PlatformRole } from '@/lib/types/database'

const ORG_COOKIE = 'mgt-org-id'

/** Allowed roles for admin access (matches layout + requireEditor). */
const ALLOWED_ROLES: OrgMemberRole[] = ['owner', 'editor']

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/** Reads the active org id from the cookie, or null if not set. */
export function getActiveOrgId(): string | null {
  const cookieStore = cookies()
  return cookieStore.get(ORG_COOKIE)?.value ?? null
}

/** Writes the active org id to the cookie. */
export function setActiveOrgId(orgId: string): void {
  const cookieStore = cookies()
  try {
    cookieStore.set(ORG_COOKIE, orgId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    })
  } catch {
    // Called from a Server Component — cookie mutation not possible.
  }
}

// ---------------------------------------------------------------------------
// Org resolution helpers
// ---------------------------------------------------------------------------

/**
 * `via` records HOW the caller reached the active org.
 *
 *   - 'membership' — the caller has a real org_members row (the normal case).
 *   - 'platform'   — the caller is platform staff reaching the org via the
 *                    Phase A compatibility shortcut (treated as effective
 *                    org owner for permission evaluation). They are NOT a
 *                    customer org owner in any business sense; callers
 *                    must not present platform-reached access as genuine
 *                    ownership in UI copy or audit reporting.
 *
 * `platform_role` is set only when `via === 'platform'`.
 */
export interface ActiveOrg {
  org_id: string
  role: OrgMemberRole
  via: 'platform' | 'membership'
  platform_role?: PlatformRole | null
}

/**
 * Resolves the user's active organisation.
 *
 * Flow:
 * 1. Check whether the user is platform staff (users.platform_role).
 *    - If yes, the platform branch runs:
 *      a. Prefer the cookie-selected org if it exists (no membership check).
 *      b. Otherwise, fall back to any real membership they may hold.
 *      c. Otherwise, fall back to the oldest organisation in the system.
 *      Platform staff always receive role 'owner' with via: 'platform' —
 *      a Phase A compatibility shortcut. See PROJECT_STATUS.md / DECISIONS.md.
 * 2. Otherwise the membership branch runs:
 *    a. Verify the cookie-selected org is one of the user's memberships
 *       (with an allowed role).
 *    b. Fall back to the first qualifying membership by created_at.
 * 3. Cookie is silently updated to the resolved org in all success paths.
 *
 * Returns null if the user is neither platform staff (with any reachable org)
 * nor a member with an allowed role.
 */
export async function getActiveOrg(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ActiveOrg | null> {
  const cookieOrgId = getActiveOrgId()

  // ── Platform branch ────────────────────────────────────────────────────
  const { data: userRow } = await supabase
    .from('users')
    .select('platform_role')
    .eq('id', userId)
    .maybeSingle()

  const platformRole = (userRow?.platform_role ?? null) as PlatformRole | null
  const isPlatformStaff = platformRole !== null

  if (isPlatformStaff) {
    // 1. Prefer the cookie-selected org if it exists at all.
    if (cookieOrgId) {
      const { data: cookieOrg } = await supabase
        .from('organisations')
        .select('id')
        .eq('id', cookieOrgId)
        .maybeSingle()

      if (cookieOrg) {
        return {
          org_id: cookieOrg.id,
          role: 'owner',
          via: 'platform',
          platform_role: platformRole,
        }
      }
    }

    // 2. Fall back to a real membership if the platform user happens to be
    //    an actual org member too. Preserve role 'owner' + via 'platform'
    //    to avoid ambiguity downstream — the platform route is the stronger
    //    claim and is what we want audit_context to record.
    const { data: memberFallback } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', userId)
      .in('role', ALLOWED_ROLES)
      .limit(1)
      .maybeSingle()

    if (memberFallback) {
      setActiveOrgId(memberFallback.org_id)
      return {
        org_id: memberFallback.org_id,
        role: 'owner',
        via: 'platform',
        platform_role: platformRole,
      }
    }

    // 3. Last-resort fallback: oldest organisation in the system. Platform
    //    staff are cross-org and do not require org membership.
    const { data: anyOrg } = await supabase
      .from('organisations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (anyOrg) {
      setActiveOrgId(anyOrg.id)
      return {
        org_id: anyOrg.id,
        role: 'owner',
        via: 'platform',
        platform_role: platformRole,
      }
    }

    return null
  }

  // ── Membership branch ──────────────────────────────────────────────────
  // If cookie is set, verify membership
  if (cookieOrgId) {
    const { data: match } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', userId)
      .eq('org_id', cookieOrgId)
      .in('role', ALLOWED_ROLES)
      .maybeSingle()

    if (match) {
      return { org_id: match.org_id, role: match.role, via: 'membership' }
    }
  }

  // Fallback: first qualifying membership
  const { data: fallback } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', userId)
    .in('role', ALLOWED_ROLES)
    .limit(1)
    .maybeSingle()

  if (!fallback) return null

  // Set cookie to the fallback org so subsequent requests skip the fallback
  setActiveOrgId(fallback.org_id)

  return { org_id: fallback.org_id, role: fallback.role, via: 'membership' }
}

export interface UserOrg {
  org_id: string
  org_name: string
  org_slug: string
  role: OrgMemberRole
}

/**
 * Returns all organisations the user belongs to (any role).
 * Used to populate the OrgSelector dropdown in a later chunk.
 */
export async function getUserOrgs(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<UserOrg[]> {
  const { data } = await supabase
    .from('org_members')
    .select('org_id, role, organisations(name, slug)')
    .eq('user_id', userId)

  if (!data) return []

  return data.map((row) => {
    const org = row.organisations as unknown as { name: string; slug: string } | null
    return {
      org_id: row.org_id,
      org_name: org?.name ?? '',
      org_slug: org?.slug ?? '',
      role: row.role,
    }
  })
}
