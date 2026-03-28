import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { EventEditor } from '@/components/admin/EventEditor'

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

  // Fetch audit log for this event, newest first
  // Join with public.users to get email addresses
  const { data: auditRows } = await supabase
    .from('audit_log')
    .select('*, users:user_id ( email )')
    .eq('event_id', params.id)
    .order('created_at', { ascending: false })
    .limit(50)

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

  const auditLog = (auditRows ?? []).map((row) => {
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

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin" className="hover:text-gray-800 transition-colors">
          Events
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-800 truncate max-w-xs">{event.title}</span>
      </div>

      <EventEditor
        event={event}
        days={dayList}
        entries={entries ?? []}
        auditLog={auditLog}
      />
    </div>
  )
}
