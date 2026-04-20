import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveOrg } from '@/lib/utils/active-org'
import { listOrgMembers, listOrgInvites } from '@/app/admin/orgs/actions'
import { loadAuditLog } from '@/app/admin/audit/actions'
import { loadExtractionLog } from '@/app/admin/extractions/actions'
import { SettingsPanels } from './SettingsPanels'
import type { OrgBranding } from '@/lib/types/database'
import { getServerAppUrl } from '@/lib/utils/app-url'
import { CONTAINER_FORM, BREADCRUMB, BREADCRUMB_LINK, BREADCRUMB_SEP, BREADCRUMB_CURRENT, H1, SUBTITLE } from '@/lib/styles'

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
  const [membersResult, invitesResult, auditResult, extractionResult] = await Promise.all([
    listOrgMembers(org.id),
    listOrgInvites(org.id),
    loadAuditLog({ orgId: org.id }),
    loadExtractionLog(org.id),
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

      <SettingsPanels
        orgId={org.id}
        orgSlug={org.slug}
        orgName={org.name}
        publicOrgUrl={`${getServerAppUrl()}/${org.slug}`}
        orgBranding={(org.branding ?? null) as OrgBranding | null}
        initialMembers={initialMembers}
        initialInvites={initialInvites}
        membersLoadError={loadError}
        initialAuditEntries={auditResult.success ? auditResult.data.entries : []}
        initialAuditLoadError={auditResult.success ? null : auditResult.error}
        initialExtractionEntries={extractionResult.success ? extractionResult.data.entries : []}
        initialExtractionLoadError={extractionResult.success ? null : extractionResult.error}
      />
    </div>
  )
}
