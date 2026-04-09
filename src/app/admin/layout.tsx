import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from './actions'
import { getActiveOrg, getUserOrgs } from '@/lib/utils/active-org'
import { OrgSelector } from '@/components/admin/OrgSelector'

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
 *    in org_members (owner | admin | editor).
 *    Authenticated users who are not org members, or who hold the viewer role,
 *    are shown an "Access denied" message. They are NOT redirected to login
 *    because they are genuinely signed in — the issue is missing permissions.
 *
 * This single check covers every page inside /admin, so individual pages
 * do not need to repeat the role check (the event editor page retains its
 * own user check only as defence-in-depth).
 */

/** Roles that are permitted to enter the admin area. */
const ALLOWED_ROLES = ['owner', 'admin', 'editor'] as const

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Persistent admin header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-4">
            {authorized && activeOrg && ['owner', 'admin'].includes(activeOrg.role) && (
              <Link
                href="/admin/orgs/settings"
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors hidden sm:block"
                title="Organisation settings"
              >
                Settings
              </Link>
            )}
            {authorized && (
              <Link
                href="/admin/orgs/new"
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors hidden sm:block"
              >
                + New org
              </Link>
            )}
            <span className="text-xs text-gray-400 hidden sm:block">
              {user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {authorized ? (
          children
        ) : (
          /* Access denied — shown to authenticated users without an allowed role */
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
    </div>
  )
}
