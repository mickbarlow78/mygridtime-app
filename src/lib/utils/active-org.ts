import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, OrgMemberRole } from '@/lib/types/database'

const ORG_COOKIE = 'mgt-org-id'

/** Allowed roles for admin access (matches layout + requireEditor). */
const ALLOWED_ROLES: OrgMemberRole[] = ['owner', 'admin', 'editor']

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

export interface ActiveOrg {
  org_id: string
  role: OrgMemberRole
}

/**
 * Resolves the user's active organisation.
 *
 * 1. Reads the mgt-org-id cookie.
 * 2. If set, verifies the user is a member of that org with an allowed role.
 * 3. If the cookie is missing, invalid, or the user is no longer a member,
 *    falls back to their first org membership (by created_at).
 * 4. Silently sets the cookie to the resolved org.
 *
 * Returns null if the user has no qualifying membership in any org.
 */
export async function getActiveOrg(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ActiveOrg | null> {
  const cookieOrgId = getActiveOrgId()

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
      return { org_id: match.org_id, role: match.role }
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

  return { org_id: fallback.org_id, role: fallback.role }
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
