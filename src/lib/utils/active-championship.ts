import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ChampionshipMemberRole, PlatformRole } from '@/lib/types/database'

const CHAMPIONSHIP_COOKIE = 'mgt-org-id'

/** Allowed roles for admin access (matches layout + requireEditor). */
const ALLOWED_ROLES: ChampionshipMemberRole[] = ['owner', 'editor']

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/** Reads the active championship id from the cookie, or null if not set. */
export function getActiveChampionshipId(): string | null {
  const cookieStore = cookies()
  return cookieStore.get(CHAMPIONSHIP_COOKIE)?.value ?? null
}

/** Writes the active championship id to the cookie. */
export function setActiveChampionshipId(championshipId: string): void {
  const cookieStore = cookies()
  try {
    cookieStore.set(CHAMPIONSHIP_COOKIE, championshipId, {
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
// Championship resolution helpers
// ---------------------------------------------------------------------------

/**
 * `via` records HOW the caller reached the active championship.
 *
 *   - 'membership' — the caller has a real org_members row (the normal case).
 *   - 'platform'   — the caller is platform staff reaching the championship
 *                    via the Phase A compatibility shortcut (treated as
 *                    effective owner for permission evaluation). They are NOT
 *                    a customer championship owner in any business sense;
 *                    callers must not present platform-reached access as
 *                    genuine ownership in UI copy or audit reporting.
 *
 * `platform_role` is set only when `via === 'platform'`.
 */
export interface ActiveChampionship {
  org_id: string
  role: ChampionshipMemberRole
  via: 'platform' | 'membership'
  platform_role?: PlatformRole | null
}

/**
 * Resolves the user's active championship.
 *
 * Flow:
 * 1. Check whether the user is platform staff (users.platform_role).
 *    - If yes, the platform branch runs:
 *      a. Prefer the cookie-selected championship if it exists (no membership check).
 *      b. Otherwise, fall back to any real membership they may hold.
 *      c. Otherwise, fall back to the oldest championship in the system.
 *      Platform staff always receive role 'owner' with via: 'platform' —
 *      a Phase A compatibility shortcut. See PROJECT_STATUS.md / DECISIONS.md.
 * 2. Otherwise the membership branch runs:
 *    a. Verify the cookie-selected championship is one of the user's memberships
 *       (with an allowed role).
 *    b. Fall back to the first qualifying membership by created_at.
 * 3. Cookie is silently updated to the resolved championship in all success paths.
 *
 * Returns null if the user is neither platform staff (with any reachable championship)
 * nor a member with an allowed role.
 */
export async function getActiveChampionship(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ActiveChampionship | null> {
  const cookieChampionshipId = getActiveChampionshipId()

  // ── Platform branch ────────────────────────────────────────────────────
  const { data: userRow } = await supabase
    .from('users')
    .select('platform_role')
    .eq('id', userId)
    .maybeSingle()

  const platformRole = (userRow?.platform_role ?? null) as PlatformRole | null
  const isPlatformStaff = platformRole !== null

  if (isPlatformStaff) {
    // 1. Prefer the cookie-selected championship if it exists at all.
    if (cookieChampionshipId) {
      const { data: cookieChampionship } = await supabase
        .from('organisations')
        .select('id')
        .eq('id', cookieChampionshipId)
        .maybeSingle()

      if (cookieChampionship) {
        return {
          org_id: cookieChampionship.id,
          role: 'owner',
          via: 'platform',
          platform_role: platformRole,
        }
      }
    }

    // 2. Fall back to a real membership if the platform user happens to be
    //    an actual championship member too. Preserve role 'owner' + via 'platform'
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
      setActiveChampionshipId(memberFallback.org_id)
      return {
        org_id: memberFallback.org_id,
        role: 'owner',
        via: 'platform',
        platform_role: platformRole,
      }
    }

    // 3. Last-resort fallback: oldest championship in the system. Platform
    //    staff are cross-championship and do not require championship membership.
    const { data: anyChampionship } = await supabase
      .from('organisations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (anyChampionship) {
      setActiveChampionshipId(anyChampionship.id)
      return {
        org_id: anyChampionship.id,
        role: 'owner',
        via: 'platform',
        platform_role: platformRole,
      }
    }

    return null
  }

  // ── Membership branch ──────────────────────────────────────────────────
  // If cookie is set, verify membership
  if (cookieChampionshipId) {
    const { data: match } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', userId)
      .eq('org_id', cookieChampionshipId)
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

  // Set cookie to the fallback championship so subsequent requests skip the fallback
  setActiveChampionshipId(fallback.org_id)

  return { org_id: fallback.org_id, role: fallback.role, via: 'membership' }
}

export interface UserChampionship {
  org_id: string
  org_name: string
  org_slug: string
  role: ChampionshipMemberRole
}

/**
 * Returns all championships the user belongs to (any role).
 * Used to populate the ChampionshipSelector dropdown.
 */
export async function getUserChampionships(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<UserChampionship[]> {
  const { data } = await supabase
    .from('org_members')
    .select('org_id, role, organisations(name, slug)')
    .eq('user_id', userId)

  if (!data) return []

  return data.map((row) => {
    const championship = row.organisations as unknown as { name: string; slug: string } | null
    return {
      org_id: row.org_id,
      org_name: championship?.name ?? '',
      org_slug: championship?.slug ?? '',
      role: row.role,
    }
  })
}
