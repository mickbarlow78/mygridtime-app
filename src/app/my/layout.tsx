import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveChampionship, getUserChampionships } from '@/lib/utils/active-championship'
import { computeUserBadge } from '@/lib/utils/role-badge'
import { ChampionshipSelector } from '@/components/admin/ChampionshipSelector'
import { UserMenu } from '@/components/admin/UserMenu'
import { BuildIdentityBadge } from '@/components/BuildIdentityBadge'
import { PAGE_BG, HEADER, HEADER_INNER, CONTAINER_FULL, HEADER_NAV_LINK } from '@/lib/styles'

/** Roles that can access /admin. MGT-084 collapsed org_members.role to
 *  owner | editor — both are elevated for admin-area purposes. */
const ELEVATED_ROLES = ['owner', 'editor'] as const

export default async function ConsumerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 1. Authentication — must be signed in
  if (!user) {
    redirect('/auth/login')
  }

  // 2. MGT-084: /my is the subscription-axis surface — any authenticated
  //    user can reach it (member or subscriber). Memberships are only read
  //    to decide whether to show the "Manage events" shortcut.
  const userChampionships = await getUserChampionships(supabase, user.id)
  const activeChampionship = userChampionships.length > 0 ? await getActiveChampionship(supabase, user.id) : null

  const hasElevatedRole = userChampionships.some((o) =>
    (ELEVATED_ROLES as readonly string[]).includes(o.role)
  )

  // Fetch the user row for the header badge.
  const { data: userRow } = await supabase
    .from('users')
    .select('platform_role, subscription_status, display_name')
    .eq('id', user.id)
    .maybeSingle()

  const platformRole = (userRow?.platform_role ?? null) as 'admin' | 'staff' | 'support' | null
  const subscriptionStatus = (userRow?.subscription_status ?? 'member') as 'member' | 'subscriber'
  const displayName = userRow?.display_name ?? null

  const activeChampionshipName =
    activeChampionship && userChampionships.find((o) => o.org_id === activeChampionship.org_id)?.org_name
      ? userChampionships.find((o) => o.org_id === activeChampionship.org_id)?.org_name ?? null
      : null

  const badge = computeUserBadge(
    { platform_role: platformRole, subscription_status: subscriptionStatus },
    activeChampionship,
    activeChampionshipName,
  )

  return (
    <div className={PAGE_BG}>
      <header className={HEADER}>
        <div className={HEADER_INNER}>
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/my" className="text-sm font-semibold text-gray-900 tracking-tight">
              MyGridTime
            </Link>
            {userChampionships.length > 1 && activeChampionship && (
              <ChampionshipSelector
                championships={userChampionships.map((o) => ({ org_id: o.org_id, org_name: o.org_name }))}
                activeChampionshipId={activeChampionship.org_id}
              />
            )}
          </div>
          <div className="flex items-center gap-4 min-w-0 flex-wrap gap-y-2">
            {hasElevatedRole && (
              <Link href="/admin" className={HEADER_NAV_LINK}>
                Manage timetables
              </Link>
            )}
            <UserMenu
              badge={badge}
              userEmail={user.email ?? ''}
              userDisplayName={displayName}
              subscriptionStatus={subscriptionStatus}
              userChampionships={userChampionships}
              activeChampionshipId={activeChampionship?.org_id ?? null}
            />
          </div>
        </div>
      </header>

      <main className={`${CONTAINER_FULL} py-6`}>
        {children}
      </main>
      <BuildIdentityBadge />
    </div>
  )
}
