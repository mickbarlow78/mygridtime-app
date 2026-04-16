import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveOrg } from '@/lib/utils/active-org'
import { listOrgMembers, listOrgInvites } from '@/app/admin/orgs/actions'
import { OrgNameForm } from './OrgNameForm'
import { PublicOrgUrlField } from './PublicOrgUrlField'
import { BrandingForm } from '@/components/admin/BrandingForm'
import { MemberManager } from '@/components/admin/MemberManager'
import type { OrgBranding } from '@/lib/types/database'
import { getServerAppUrl } from '@/lib/utils/app-url'
import { CONTAINER_FORM, BREADCRUMB, BREADCRUMB_LINK, BREADCRUMB_SEP, BREADCRUMB_CURRENT, H1, SUBTITLE, H2, CARD, CARD_PADDING_COMPACT, HELP_TEXT, ERROR_BANNER } from '@/lib/styles'

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
  const membersError = membersResult.success ? null : membersResult.error
  const invitesError = invitesResult.success ? null : invitesResult.error
  const loadError =
    membersError && invitesError
      ? `${membersError} · ${invitesError}`
      : (membersError ?? invitesError)

  return (
    <div className={`${CONTAINER_FORM} space-y-8`}>
      {/* Breadcrumb */}
      <div className={BREADCRUMB}>
        <Link href="/admin" className={BREADCRUMB_LINK}>Events</Link>
        <span className={BREADCRUMB_SEP}>/</span>
        <span className={BREADCRUMB_CURRENT}>Organisation settings</span>
      </div>

      <div>
        <h1 className={H1}>{org.name}</h1>
        <p className={SUBTITLE}>
          Manage organisation details and members.
        </p>
      </div>

      {/* Org name form */}
      <section>
        <h2 className={`${H2} mb-3`}>Organisation name</h2>
        <OrgNameForm orgId={org.id} currentName={org.name} />
      </section>

      {/* Slug (read-only) */}
      <section>
        <h2 className={`${H2} mb-3`}>Slug</h2>
        <div className={`${CARD} ${CARD_PADDING_COMPACT} space-y-3`}>
          <div>
            <p className="text-sm font-mono text-gray-600">{org.slug}</p>
            <p className={HELP_TEXT}>
              The slug cannot be changed after creation. It forms part of the public
              organisation URL below and is shared with all of this org&rsquo;s event URLs.
            </p>
          </div>
          <PublicOrgUrlField publicUrl={`${getServerAppUrl()}/o/${org.slug}`} />
        </div>
      </section>

      {/* Branding */}
      <section>
        <h2 className={`${H2} mb-3`}>Branding</h2>
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
        <h2 className={`${H2} mb-3`}>Members &amp; invites</h2>
        {loadError && (
          <div className={`${ERROR_BANNER} mb-3`} role="alert">
            {loadError}
          </div>
        )}
        <MemberManager
          orgId={org.id}
          initialMembers={initialMembers}
          initialInvites={initialInvites}
        />
      </section>
    </div>
  )
}
