import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveOrg } from '@/lib/utils/active-org'
import { listOrgMembers, listOrgInvites } from '@/app/admin/orgs/actions'
import { OrgNameForm } from './OrgNameForm'
import { BrandingForm } from '@/components/admin/BrandingForm'
import { MemberManager } from '@/components/admin/MemberManager'
import type { OrgBranding } from '@/lib/types/database'

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

  // Fetch org details (include branding for the BrandingForm initial values)
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name, slug, branding')
    .eq('id', activeOrg.org_id)
    .single()

  if (!org) redirect('/admin')

  // Fetch members and invites server-side so MemberManager can hydrate
  // immediately without a blank-then-populate flash on first paint.
  const [membersResult, invitesResult] = await Promise.all([
    listOrgMembers(org.id),
    listOrgInvites(org.id),
  ])
  const initialMembers = membersResult.success ? membersResult.data : []
  const initialInvites = invitesResult.success ? invitesResult.data : []

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
          <p className="text-xs text-gray-400 mt-1">
            The slug cannot be changed after creation. Public URLs are per-event,
            not per-organisation.
          </p>
        </div>
      </section>

      {/* Branding */}
      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Branding</h2>
        <p className="text-sm text-gray-500 mb-3">
          Applied to public timetable pages. Event-level branding overrides these values per field.
        </p>
        <BrandingForm
          orgId={org.id}
          currentBranding={(org.branding ?? null) as OrgBranding | null}
        />
      </section>

      {/* Members + Invites */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Members &amp; invites</h2>
        <MemberManager
          orgId={org.id}
          initialMembers={initialMembers}
          initialInvites={initialInvites}
        />
      </section>
    </div>
  )
}
