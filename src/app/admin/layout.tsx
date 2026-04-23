import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { getActiveOrg, getUserOrgs } from '@/lib/utils/active-org'
import { OrgSelector } from '@/components/admin/OrgSelector'
import { UserMenu } from '@/components/admin/UserMenu'
import { BuildIdentityBadge } from '@/components/BuildIdentityBadge'
import { computeUserBadge } from '@/lib/utils/role-badge'
import { PAGE_BG, HEADER, HEADER_INNER, CONTAINER_FULL, HEADER_NAV_LINK, BTN_PRIMARY } from '@/lib/styles'

/**
 * Admin layout — Server Component.
 *
 * Two-layer guard:
 *
 * 1. Authentication — checks for a valid Supabase session.
 *    Unauthenticated users are redirected to /auth/login.
 *    (Middleware also enforces this as a first pass.)
 *
 * 2. Authorisation — checks that the authenticated user holds an allowed role
 *    in org_members (owner | editor). Under MGT-084 those are the only two
 *    org-member roles; the legacy admin role was collapsed into editor and
 *    viewer rows were removed by the 20260420010000 migration.
 *    Authenticated users with no qualifying membership are shown an
 *    "Access denied" message. They are NOT redirected to login because they
 *    are genuinely signed in — the issue is missing permissions.
 *
 * This single check covers every page inside /admin, so individual pages
 * do not need to repeat the role check (the event editor page retains its
 * own user check only as defence-in-depth).
 */

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 1. Authentication
  if (!user) {
    redirect('/auth/login')
  }

  // 2. Authorisation — must hold an allowed role in at least one org
  const activeOrg = await getActiveOrg(supabase, user.id)
  const userOrgs = activeOrg ? await getUserOrgs(supabase, user.id) : []

  const authorized = !!activeOrg

  // Fetch the user's platform_role, subscription_status, and display_name
  // once for the header badge. The row is guaranteed to exist — signup
  // inserts it via trigger.
  const { data: userRow } = await supabase
    .from('users')
    .select('platform_role, subscription_status, display_name')
    .eq('id', user.id)
    .maybeSingle()

  const platformRole = (userRow?.platform_role ?? null) as 'admin' | 'staff' | 'support' | null
  const subscriptionStatus = (userRow?.subscription_status ?? 'member') as 'member' | 'subscriber'
  const displayName = userRow?.display_name ?? null

  // Resolve the active org name for the badge scope label.
  const activeOrgName =
    activeOrg && userOrgs.find((o) => o.org_id === activeOrg.org_id)?.org_name
      ? userOrgs.find((o) => o.org_id === activeOrg.org_id)?.org_name ?? null
      : null

  const badge = computeUserBadge(
    { platform_role: platformRole, subscription_status: subscriptionStatus },
    activeOrg,
    activeOrgName,
  )

  // First-run onboarding: a newly signed-in user with zero memberships is
  // allowed to reach /admin/orgs/new so they can create their first org.
  // We use the x-pathname header set by middleware to detect the route.
  const pathname = headers().get('x-pathname') ?? ''
  let allowNoOrgOnboarding = false
  if (!authorized && pathname === '/admin/orgs/new') {
    const { count } = await supabase
      .from('org_members')
      .select('org_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    allowNoOrgOnboarding = (count ?? 0) === 0
  }

  // Detect "no memberships at all" for the access-denied state so we can
  // offer a "Create your first organisation" CTA for that case.
  let hasZeroMemberships = false
  if (!authorized && !allowNoOrgOnboarding) {
    const { count } = await supabase
      .from('org_members')
      .select('org_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    hasZeroMemberships = (count ?? 0) === 0
  }

  return (
    <div className={PAGE_BG}>
      {/* Persistent admin header */}
      <header className={HEADER}>
        <div className={HEADER_INNER}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-semibold text-gray-900 tracking-tight">
              MyGridTime
            </span>
            {authorized && userOrgs.length > 1 && activeOrg && (
              <OrgSelector
                orgs={userOrgs.map((o) => ({ org_id: o.org_id, org_name: o.org_name }))}
                activeOrgId={activeOrg.org_id}
              />
            )}
          </div>
          <div className="flex items-center gap-4 min-w-0 flex-wrap gap-y-2">
            {authorized && (
              <Link
                href="/admin"
                className={HEADER_NAV_LINK}
                title="Timetables dashboard"
              >
                Timetables
              </Link>
            )}
            {authorized && activeOrg && activeOrg.role === 'owner' && (
              <Link
                href="/admin/orgs/settings"
                className={HEADER_NAV_LINK}
                title="Organisation settings"
              >
                Settings
              </Link>
            )}
            {authorized && (
              <Link
                href="/admin/orgs/new"
                className={HEADER_NAV_LINK}
              >
                + New org
              </Link>
            )}
            <UserMenu
              badge={badge}
              userEmail={user.email ?? ''}
              userDisplayName={displayName}
              subscriptionStatus={subscriptionStatus}
              userOrgs={userOrgs}
              activeOrgId={activeOrg?.org_id ?? null}
            />
          </div>
        </div>
      </header>

      <main className={`${CONTAINER_FULL} py-6`}>
        {authorized || allowNoOrgOnboarding ? (
          children
        ) : hasZeroMemberships ? (
          /* First-run onboarding state — user is signed in but has no orgs yet */
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
            </div>
            <h1 className="text-base font-semibold text-gray-900">Welcome to MyGridTime</h1>
            <p className="text-sm text-gray-500 max-w-sm">
              You are signed in as <span className="font-medium text-gray-700">{user.email}</span>,
              but you do not belong to any organisation yet. Create one to start building timetables,
              or ask an existing organisation admin to invite you.
            </p>
            <Link href="/admin/orgs/new" className={BTN_PRIMARY}>
              Create your first organisation
            </Link>
          </div>
        ) : (
          /* Access denied — shown to authenticated users without an allowed role. */
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h1 className="text-base font-semibold text-gray-900">Access denied</h1>
            <p className="text-sm text-gray-500 max-w-sm">
              <span className="font-medium text-gray-700">{user.email}</span> does not
              have permission to access the admin area. Contact your organisation
              administrator to request access.
            </p>
          </div>
        )}
      </main>
      <BuildIdentityBadge />
    </div>
  )
}
