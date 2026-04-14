import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { EventEditor } from '@/components/admin/EventEditor'
import { BREADCRUMB, BREADCRUMB_LINK, BREADCRUMB_SEP, BREADCRUMB_CURRENT } from '@/lib/styles'

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
  const { data: days } = await supabase
    .from('event_days')
    .select('*')
    .eq('event_id', params.id)
    .order('sort_order', { ascending: true })
    .order('date', { ascending: true })

  const dayList = days ?? []

  // Fetch all timetable entries for every day of this event
  const { data: entries } = await supabase
    .from('timetable_entries')
    .select('*')
    .in(
      'event_day_id',
      dayList.map((d) => d.id)
    )
    .order('sort_order', { ascending: true })

  // Fetch version history (timetable snapshots)
  const { data: snapshotRows } = await supabase
    .from('timetable_snapshots')
    .select('id, version, published_at, published_by')
    .eq('event_id', params.id)
    .order('version', { ascending: false })

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
  const { data: auditRows } = await supabase
    .from('audit_log')
    .select('*, users:user_id ( email )')
    .eq('event_id', params.id)
    .order('created_at', { ascending: false })
    .limit(auditPageSize + 1)

  // Flatten the joined email onto each row
  type AuditRowRaw = {
    id: string
    user_id: string | null
    event_id: string | null
    action: string
    detail: unknown
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

      <EventEditor
        event={event}
        days={dayList}
        entries={entries ?? []}
        auditLog={auditLog}
        auditHasMore={auditHasMore}
        versions={versions}
        unsubscribedEmails={unsubscribedEmails}
      />
    </div>
  )
}
