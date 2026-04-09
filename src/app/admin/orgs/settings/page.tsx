import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveOrg } from '@/lib/utils/active-org'
import { OrgNameForm } from './OrgNameForm'
import { MemberManager } from '@/components/admin/MemberManager'

/**
 * Org settings page — server component.
 * Only accessible to owner/admin of the active org.
 */
export default async function OrgSettingsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const activeOrg = await getActiveOrg(supabase, user.id)
  if (!activeOrg) redirect('/admin')

  if (!['owner', 'admin'].includes(activeOrg.role)) {
    redirect('/admin')
  }

  // Fetch org details
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name, slug')
    .eq('id', activeOrg.org_id)
    .single()

  if (!org) redirect('/admin')

  return (
    <div className="max-w-2xl space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin" className="hover:text-gray-800 transition-colors">Events</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-800">Organisation settings</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">{org.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage organisation details and members.
        </p>
      </div>

      {/* Org name form */}
      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Organisation name</h2>
        <OrgNameForm orgId={org.id} currentName={org.name} />
      </section>

      {/* Slug (read-only) */}
      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Slug</h2>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-sm font-mono text-gray-600">{org.slug}</p>
          <p className="text-xs text-gray-400 mt-1">The slug cannot be changed after creation.</p>
        </div>
      </section>

      {/* Members + Invites */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Members &amp; invites</h2>
        <MemberManager orgId={org.id} />
      </section>
    </div>
  )
}
