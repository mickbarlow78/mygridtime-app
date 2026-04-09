/**
 * sendEventNotification — core Phase 5 notification helper.
 *
 * Called from server actions after a successful publish or timetable save.
 * Handles recipient lookup, debounce, Resend send, and logging in one place.
 *
 * SEND RULES
 * ──────────
 * event.published  — sends when publishEvent() succeeds on a published event.
 *                    10-minute debounce prevents duplicate sends on
 *                    accidental double-clicks or re-triggers.
 *
 * timetable.updated — sends when saveDayEntries() saves substantive changes
 *                     (adds/removes/edits) AND the event is already published.
 *                     10-minute debounce: only one update email per event per
 *                     10-minute window, regardless of how many saves happen.
 *
 * Metadata-only saves (title, venue, dates, notes) do NOT trigger
 * notifications.  The timetable.updated email is specifically for schedule
 * changes that affect when participants need to be somewhere.
 *
 * FAILURE HANDLING
 * ────────────────
 * A failed Resend call logs the error to notification_log but does NOT
 * bubble an exception.  The calling action (publish, save) has already
 * succeeded by the time this runs, and an email failure must not roll it back.
 */

import { getResendClient, getFromAddress } from './client'
import { debugLog } from '@/lib/debug'
import {
  eventPublishedSubject,
  eventPublishedHtml,
  eventPublishedText,
  timetableUpdatedSubject,
  timetableUpdatedHtml,
  timetableUpdatedText,
} from './templates'
import { formatDate } from '@/lib/utils/slug'
import { getServerAppUrl } from '@/lib/utils/app-url'
import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>
type NotificationType = 'event.published' | 'timetable.updated'

// Debounce windows by notification type
const DEBOUNCE_MS: Record<NotificationType, number> = {
  'event.published':   10 * 60 * 1000,   // 10 minutes
  'timetable.updated': 10 * 60 * 1000,   // 10 minutes
}

export async function sendEventNotification(
  supabase: SupabaseClient,
  eventId: string,
  type: NotificationType
): Promise<void> {
  debugLog('sendEventNotification', 'ENTER type:', type, '| eventId:', eventId)
  // ── 1. Fetch event (slug, title, venue, dates, recipients) ───────────────
  const { data: event } = await supabase
    .from('events')
    .select('slug, title, venue, start_date, end_date, notification_emails')
    .eq('id', eventId)
    .maybeSingle()

  if (!event) return

  // ── 2. Skip if no recipients ─────────────────────────────────────────────
  const recipients = event.notification_emails ?? []
  if (recipients.length === 0) return

  // ── 3. Build email data ──────────────────────────────────────────────────
  const dateRange =
    event.start_date === event.end_date
      ? formatDate(event.start_date)
      : `${formatDate(event.start_date)} – ${formatDate(event.end_date)}`

  const appUrl = getServerAppUrl()
  const publicUrl = `${appUrl}/${event.slug}`

  const emailData = {
    eventTitle: event.title,
    venue: event.venue,
    dateRange,
    publicUrl,
  }

  const subject =
    type === 'event.published'
      ? eventPublishedSubject(event.title)
      : timetableUpdatedSubject(event.title)

  const html =
    type === 'event.published'
      ? eventPublishedHtml(emailData)
      : timetableUpdatedHtml(emailData)

  const text =
    type === 'event.published'
      ? eventPublishedText(emailData)
      : timetableUpdatedText(emailData)

  // ── 4. Send via Resend — one send per recipient, debounce + log each ────
  const resend = getResendClient()
  const from = getFromAddress()
  const now = new Date().toISOString()
  const windowMs = DEBOUNCE_MS[type]
  const windowStart = new Date(Date.now() - windowMs).toISOString()

  for (const to of recipients) {
    debugLog('sendEventNotification', 'recipient:', to)
    // Per-recipient debounce — skip if a successful send went out recently
    const { data: recent } = await supabase
      .from('notification_log')
      .select('id')
      .eq('event_id', eventId)
      .eq('type', type)
      .eq('recipient_email', to)
      .eq('status', 'sent')
      .gte('created_at', windowStart)
      .limit(1)
      .maybeSingle()

    debugLog('sendEventNotification', 'debounce recent:', !!recent)
    if (recent) continue  // within debounce window for this recipient — skip

    if (!resend) {
      // Resend not configured (missing API key) — log as failed and continue
      await supabase.from('notification_log').insert({
        event_id: eventId,
        type,
        recipient_email: to,
        status: 'failed',
        error: 'RESEND_API_KEY is not configured.',
        sent_at: null,
      })
      continue
    }

    try {
      debugLog('sendEventNotification', 'ATTEMPT resend.emails.send to:', to)
      const { error: sendError } = await resend.emails.send({
        from,
        to,
        subject,
        html,
        text,
      })

      debugLog('sendEventNotification', 'resend result — error:', sendError ?? null)
      if (sendError) {
        await supabase.from('notification_log').insert({
          event_id: eventId,
          type,
          recipient_email: to,
          status: 'failed',
          error: sendError.message,
          sent_at: null,
        })
      } else {
        await supabase.from('notification_log').insert({
          event_id: eventId,
          type,
          recipient_email: to,
          status: 'sent',
          error: null,
          sent_at: now,
        })
      }
    } catch (err) {
      // Unexpected error (network, etc.) — log and continue to next recipient
      await supabase.from('notification_log').insert({
        event_id: eventId,
        type,
        recipient_email: to,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        sent_at: null,
      })
    }
  }
}
