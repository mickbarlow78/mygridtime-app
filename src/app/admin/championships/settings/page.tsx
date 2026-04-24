import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveChampionship } from '@/lib/utils/active-championship'
import { listChampionshipMembers, listChampionshipInvites } from '@/app/admin/championships/actions'
import { loadAuditLog } from '@/app/admin/audit/actions'
import { loadExtractionLog } from '@/app/admin/extractions/actions'
import { SettingsPanels } from './SettingsPanels'
import type { ChampionshipBranding } from '@/lib/types/database'
import { getServerAppUrl } from '@/lib/utils/app-url'
import { CONTAINER_FORM, BREADCRUMB, BREADCRUMB_LINK, BREADCRUMB_SEP, BREADCRUMB_CURRENT, H1, SUBTITLE } from '@/lib/styles'

/**
 * Championship settings page — server component.
 * MGT-084: owner-only. Platform staff/support reach this via the
 * `via: 'platform'` short-circuit in getActiveChampionship (returns role 'owner').
 */
export default async function ChampionshipSettingsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const activeChampionship = await getActiveChampionship(supabase, user.id)
  if (!activeChampionship) redirect('/admin')

  if (activeChampionship.role !== 'owner') {
    redirect('/admin')
  }

  // Fetch championship details (include branding for the BrandingForm initial values)
  const { data: championship } = await supabase
    .from('organisations')
    .select('id, name, slug, branding')
    .eq('id', activeChampionship.org_id)
    .single()

  if (!championship) redirect('/admin')

  // Fetch members and invites server-side so MemberManager can hydrate
  // immediately without a blank-then-populate flash on first paint.
  const [membersResult, invitesResult, auditResult, extractionResult] = await Promise.all([
    listChampionshipMembers(championship.id),
    listChampionshipInvites(championship.id),
    loadAuditLog({ championshipId: championship.id }),
    loadExtractionLog(championship.id),
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
        <Link href="/admin" className={BREADCRUMB_LINK}>Timetables</Link>
        <span className={BREADCRUMB_SEP}>/</span>
        <span className={BREADCRUMB_CURRENT}>Championship settings</span>
      </div>

      <div>
        <h1 className={H1}>{championship.name}</h1>
        <p className={SUBTITLE}>
          Manage championship details and members.
        </p>
      </div>

      <SettingsPanels
        key={championship.id}
        championshipId={championship.id}
        championshipSlug={championship.slug}
        championshipName={championship.name}
        publicChampionshipUrl={`${getServerAppUrl()}/${championship.slug}`}
        championshipBranding={(championship.branding ?? null) as ChampionshipBranding | null}
        currentUserId={user.id}
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
