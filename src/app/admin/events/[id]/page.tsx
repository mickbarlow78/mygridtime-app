import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { EventEditor } from '@/components/admin/EventEditor'
import {
  BREADCRUMB,
  BREADCRUMB_LINK,
  BREADCRUMB_SEP,
  BREADCRUMB_CURRENT,
  ERROR_BANNER,
} from '@/lib/styles'

// Always fetch fresh data — never serve a cached timetable editor
export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export default async function EventEditorPage({ params }: PageProps) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  // Fetch event (RLS ensures the user can only see events in their org)
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('id', params.id)
    .is('deleted_at', null)
    .single()

  if (eventError || !event) notFound()

  // Fetch event days, sorted
  const { data: days, error: daysError } = await supabase
    .from('event_days')
    .select('*')
    .eq('event_id', params.id)
    .order('sort_order', { ascending: true })
    .order('date', { ascending: true })

  if (daysError) {
    Sentry.captureException(daysError, {
      tags: { action: 'eventEditorPage.listDays' },
    })
  }

  const dayList = days ?? []

  // Fetch all timetable entries for every day of this event
  const { data: entries, error: entriesError } = await supabase
    .from('timetable_entries')
    .select('*')
    .in(
      'event_day_id',
      dayList.map((d) => d.id)
    )
    .order('sort_order', { ascending: true })

  if (entriesError) {
    Sentry.captureException(entriesError, {
      tags: { action: 'eventEditorPage.listEntries' },
    })
  }

  // Combined load-error for the two queries most critical to rendering a
  // correct editor. A silent failure on either would otherwise present as
  // an empty / wiped event — the highest blast-radius silent-swallow on
  // this page. The remaining three silent queries (snapshots, publisher
  // emails, audit rows) are deferred: snapshots has client-side rescue
  // via MGT-032, audit rows via MGT-030, and publisher emails are purely
  // cosmetic.
  const loadError =
    daysError && entriesError
      ? 'Could not load this event. Please retry.'
      : daysError
        ? 'Could not load the timetable days. Please retry.'
        : entriesError
          ? 'Could not load the timetable entries. Please retry.'
          : null

  // Fetch version history (timetable snapshots)
  const { data: snapshotRows, error: snapshotsError } = await supabase
    .from('timetable_snapshots')
    .select('id, version, published_at, published_by')
    .eq('event_id', params.id)
    .order('version', { ascending: false })

  if (snapshotsError) {
    Sentry.captureException(snapshotsError, {
      tags: { action: 'eventEditorPage.listSnapshots' },
    })
  }

  // Surface initial-list failure through a section-scoped banner above
  // <VersionHistory />. MGT-032 only rescues per-click getSnapshotData()
  // failures — with an empty versions array there are no rows to click,
  // so a silent initial-list failure otherwise presents as a fake-empty
  // "No versions yet." state. Page reload is the retry path.
  const versionsLoadError = snapshotsError
    ? 'Could not load version history. Please retry.'
    : null

  // Resolve snapshot publisher emails
  const snapshotPublisherIds = Array.from(
    new Set((snapshotRows ?? []).map((r) => r.published_by).filter(Boolean))
  ) as string[]
  let snapshotEmailMap: Record<string, string> = {}
  if (snapshotPublisherIds.length > 0) {
    const { data: pubUsers } = await supabase
      .from('users')
      .select('id, email')
      .in('id', snapshotPublisherIds)
    snapshotEmailMap = Object.fromEntries((pubUsers ?? []).map((u) => [u.id, u.email]))
  }

  const versions = (snapshotRows ?? []).map((row) => ({
    id: row.id,
    version: row.version,
    published_at: row.published_at,
    published_by_email: row.published_by ? snapshotEmailMap[row.published_by] ?? null : null,
  }))

  // Fetch unsubscribed notification recipients (service-role required — RLS has no policies)
  let unsubscribedEmails: string[] = []
  const rawEmails = event.notification_emails ?? []
  if (rawEmails.length > 0) {
    try {
      const admin = createAdminClient()
      const normalised = rawEmails.map((e: string) => e.toLowerCase())
      const { data: prefs } = await admin
        .from('notification_preferences')
        .select('email')
        .in('email', normalised)
        .eq('unsubscribed', true)
      unsubscribedEmails = (prefs ?? []).map((p) => p.email)
    } catch {
      // Degrade silently — admin visibility is non-critical
    }
  }

  // Fetch audit log for this event, newest first
  // Join with public.users to get email addresses
  // Fetch pageSize+1 to detect whether more rows exist
  const auditPageSize = 25
  const { data: auditRows, error: auditError } = await supabase
    .from('audit_log')
    .select('*, users:user_id ( email )')
    .eq('event_id', params.id)
    .order('created_at', { ascending: false })
    .limit(auditPageSize + 1)

  if (auditError) {
    Sentry.captureException(auditError, {
      tags: { action: 'eventEditorPage.listAudit' },
    })
  }

  // Surface initial-load failure through the AuditLogView panel banner.
  // An empty `auditRows` on failure would otherwise collapse `auditHasMore`
  // to false, which short-circuits MGT-030's rescue path — so we thread
  // the error in via a new prop that seeds `loadError` + flips `allLoaded`
  // so opening the panel naturally retries.
  const auditLoadError = auditError
    ? 'Could not load audit log. Please retry.'
    : null

  // Flatten the joined email onto each row
  type AuditRowRaw = {
    id: string
    user_id: string | null
    event_id: string | null
    action: string
    detail: unknown
    actor_context: unknown
    created_at: string
    users: { email: string } | null
  }

  const allAuditRows = (auditRows ?? []).map((row) => {
    const raw = row as unknown as AuditRowRaw
    return {
      id: raw.id,
      user_id: raw.user_id,
      event_id: raw.event_id,
      action: raw.action,
      detail: raw.detail as import('@/lib/types/database').Json | null,
      actor_context: raw.actor_context as import('@/lib/types/database').Json | null,
      created_at: raw.created_at,
      user_email: raw.users?.email ?? null,
    }
  })

  const auditHasMore = allAuditRows.length > auditPageSize
  const auditLog = auditHasMore ? allAuditRows.slice(0, auditPageSize) : allAuditRows

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className={BREADCRUMB}>
        <Link href="/admin" className={BREADCRUMB_LINK}>
          Events
        </Link>
        <span className={BREADCRUMB_SEP}>/</span>
        <span className={`${BREADCRUMB_CURRENT} truncate max-w-xs`}>{event.title}</span>
      </div>

      {loadError && (
        <div className={ERROR_BANNER} role="alert">{loadError}</div>
      )}

      <EventEditor
        event={event}
        days={dayList}
        entries={entries ?? []}
        auditLog={auditLog}
        auditHasMore={auditHasMore}
        auditLoadError={auditLoadError}
        versions={versions}
        versionsLoadError={versionsLoadError}
        unsubscribedEmails={unsubscribedEmails}
      />
    </div>
  )
}
