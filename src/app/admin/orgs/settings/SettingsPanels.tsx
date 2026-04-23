'use client'

import { useState } from 'react'
import { OrgNameForm } from './OrgNameForm'
import { PublicOrgUrlField } from './PublicOrgUrlField'
import { BrandingForm } from '@/components/admin/BrandingForm'
import { MemberManager, type Member, type Invite } from '@/components/admin/MemberManager'
import { OrgAuditLogView } from '@/components/admin/OrgAuditLogView'
import { ExtractionLogView } from '@/components/admin/ExtractionLogView'
import type { OrgBranding } from '@/lib/types/database'
import type { AuditLogEntry } from '@/lib/audit'
import type { ExtractionLogEntry } from '@/app/admin/extractions/actions'
import { CARD, CARD_PADDING_COMPACT, H2, HELP_TEXT, ERROR_BANNER } from '@/lib/styles'

interface SettingsPanelsProps {
  orgId: string
  orgSlug: string
  orgName: string
  publicOrgUrl: string
  orgBranding: OrgBranding | null
  currentUserId: string
  initialMembers: Member[]
  initialInvites: Invite[]
  membersLoadError: string | null
  initialAuditEntries: AuditLogEntry[]
  initialAuditLoadError: string | null
  initialExtractionEntries: ExtractionLogEntry[]
  initialExtractionLoadError: string | null
}

export function SettingsPanels({
  orgId,
  orgSlug,
  orgName,
  publicOrgUrl,
  orgBranding,
  currentUserId,
  initialMembers,
  initialInvites,
  membersLoadError,
  initialAuditEntries,
  initialAuditLoadError,
  initialExtractionEntries,
  initialExtractionLoadError,
}: SettingsPanelsProps) {
  const [refreshSignal, setRefreshSignal] = useState(0)
  const bumpRefresh = () => setRefreshSignal((n) => n + 1)

  return (
    <>
      {/* Org name form */}
      <section>
        <h2 className={`${H2} mb-3`}>Organisation name</h2>
        <OrgNameForm orgId={orgId} currentName={orgName} onSaved={bumpRefresh} />
      </section>

      {/* Slug (read-only) */}
      <section>
        <h2 className={`${H2} mb-3`}>Slug</h2>
        <div className={`${CARD} ${CARD_PADDING_COMPACT} space-y-3`}>
          <div>
            <p className="text-sm font-mono text-gray-600">{orgSlug}</p>
            <p className={HELP_TEXT}>
              The slug cannot be changed after creation. It forms the public
              organisation URL below and shares the top-level URL space with
              individual event slugs.
            </p>
          </div>
          <PublicOrgUrlField publicUrl={publicOrgUrl} />
        </div>
      </section>

      {/* Branding */}
      <section>
        <h2 className={`${H2} mb-3`}>Branding</h2>
        <p className="text-sm text-gray-500 mb-3">
          Applied to public timetable pages. Event-level branding overrides these values per field.
        </p>
        <BrandingForm
          orgId={orgId}
          currentBranding={orgBranding}
          onSaved={bumpRefresh}
        />
      </section>

      {/* Members + Invites */}
      <section>
        <h2 className={`${H2} mb-3`}>Members &amp; invites</h2>
        {membersLoadError && (
          <div className={`${ERROR_BANNER} mb-3`} role="alert">
            {membersLoadError}
          </div>
        )}
        <MemberManager
          orgId={orgId}
          currentUserId={currentUserId}
          initialMembers={initialMembers}
          initialInvites={initialInvites}
          onSaved={bumpRefresh}
        />
      </section>

      {/* Extraction log */}
      <section>
        <h2 className={`${H2} mb-3`}>Extraction log</h2>
        <p className="text-sm text-gray-500 mb-3">
          AI extraction attempts for this organisation. Mock extractions are not logged.
        </p>
        <ExtractionLogView
          entries={initialExtractionEntries}
          orgId={orgId}
          initialHasMore={false}
          initialLoadError={initialExtractionLoadError}
          refreshSignal={refreshSignal}
        />
      </section>

      {/* Audit log */}
      <section>
        <h2 className={`${H2} mb-3`}>Audit log</h2>
        <OrgAuditLogView
          entries={initialAuditEntries}
          orgId={orgId}
          initialHasMore={false}
          initialLoadError={initialAuditLoadError}
          refreshSignal={refreshSignal}
        />
      </section>
    </>
  )
}
