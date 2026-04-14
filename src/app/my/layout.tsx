import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/admin/actions'
import { PAGE_BG, HEADER, HEADER_INNER, CONTAINER_FULL, AUTH_EMAIL, AUTH_LINK, HEADER_NAV_LINK } from '@/lib/styles'

/** Roles that can access /admin (owner, admin, editor). */
const ELEVATED_ROLES = ['owner', 'admin', 'editor'] as const

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

  // 2. Authorisation — must be a member of at least one org (any role)
  const { data: memberships } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)

  const hasAccess = memberships && memberships.length > 0
  const hasElevatedRole = memberships?.some((m) =>
    (ELEVATED_ROLES as readonly string[]).includes(m.role)
  )

  return (
    <div className={PAGE_BG}>
      <header className={HEADER}>
        <div className={HEADER_INNER}>
          <div className="flex items-center gap-3">
            <Link href="/my" className="text-sm font-semibold text-gray-900 tracking-tight">
              MyGridTime
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {hasElevatedRole && (
              <Link href="/admin" className={HEADER_NAV_LINK}>
                Manage events
              </Link>
            )}
            <span className={AUTH_EMAIL}>{user.email}</span>
            <form action={signOut}>
              <button type="submit" className={AUTH_LINK}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className={`${CONTAINER_FULL} py-6`}>
        {hasAccess ? (
          children
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h1 className="text-base font-semibold text-gray-900">No access</h1>
            <p className="text-sm text-gray-500 max-w-sm">
              <span className="font-medium text-gray-700">{user.email}</span> is not a member
              of any organisation. Ask your organisation administrator to invite you.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
