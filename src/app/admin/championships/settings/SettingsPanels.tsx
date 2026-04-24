'use client'

import { useState } from 'react'
import { ChampionshipNameForm } from './ChampionshipNameForm'
import { PublicChampionshipUrlField } from './PublicChampionshipUrlField'
import { BrandingForm } from '@/components/admin/BrandingForm'
import { MemberManager, type Member, type Invite } from '@/components/admin/MemberManager'
import { ChampionshipAuditLogView } from '@/components/admin/ChampionshipAuditLogView'
import { ExtractionLogView } from '@/components/admin/ExtractionLogView'
import type { ChampionshipBranding } from '@/lib/types/database'
import type { AuditLogEntry } from '@/lib/audit'
import type { ExtractionLogEntry } from '@/app/admin/extractions/actions'
import { CARD, CARD_PADDING_COMPACT, H2, HELP_TEXT, ERROR_BANNER } from '@/lib/styles'

interface SettingsPanelsProps {
  championshipId: string
  championshipSlug: string
  championshipName: string
  publicChampionshipUrl: string
  championshipBranding: ChampionshipBranding | null
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
  championshipId,
  championshipSlug,
  championshipName,
  publicChampionshipUrl,
  championshipBranding,
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
      {/* Championship name form */}
      <section>
        <h2 className={`${H2} mb-3`}>Championship name</h2>
        <ChampionshipNameForm championshipId={championshipId} currentName={championshipName} onSaved={bumpRefresh} />
      </section>

      {/* Slug (read-only) */}
      <section>
        <h2 className={`${H2} mb-3`}>Slug</h2>
        <div className={`${CARD} ${CARD_PADDING_COMPACT} space-y-3`}>
          <div>
            <p className="text-sm font-mono text-gray-600">{championshipSlug}</p>
            <p className={HELP_TEXT}>
              The slug cannot be changed after creation. It forms the public
              championship URL below and shares the top-level URL space with
              individual event slugs.
            </p>
          </div>
          <PublicChampionshipUrlField publicUrl={publicChampionshipUrl} />
        </div>
      </section>

      {/* Branding */}
      <section>
        <h2 className={`${H2} mb-3`}>Branding</h2>
        <p className="text-sm text-gray-500 mb-3">
          Applied to public timetable pages. Event-level branding overrides these values per field.
        </p>
        <BrandingForm
          championshipId={championshipId}
          currentBranding={championshipBranding}
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
          championshipId={championshipId}
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
          AI extraction attempts for this championship. Mock extractions are not logged.
        </p>
        <ExtractionLogView
          entries={initialExtractionEntries}
          championshipId={championshipId}
          initialHasMore={false}
          initialLoadError={initialExtractionLoadError}
          refreshSignal={refreshSignal}
        />
      </section>

      {/* Audit log */}
      <section>
        <h2 className={`${H2} mb-3`}>Audit log</h2>
        <ChampionshipAuditLogView
          entries={initialAuditEntries}
          championshipId={championshipId}
          initialHasMore={false}
          initialLoadError={initialAuditLoadError}
          refreshSignal={refreshSignal}
        />
      </section>
    </>
  )
}
