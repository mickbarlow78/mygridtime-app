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
 * UNSUBSCRIBE
 * ───────────
 * Each recipient has a row in notification_preferences with a unique token.
 * Unsubscribed recipients are silently skipped. Each email includes a
 * token-based unsubscribe link that works without authentication.
 *
 * FAILURE HANDLING
 * ────────────────
 * A failed Resend call logs the error to notification_log but does NOT
 * bubble an exception.  The calling action (publish, save) has already
 * succeeded by the time this runs, and an email failure must not roll it back.
 */

import { getResendClient, getFromAddress } from './client'
import { debugLog } from '@/lib/debug'
import * as Sentry from '@sentry/nextjs'
import {
  eventPublishedSubject,
  eventPublishedHtml,
  eventPublishedText,
  timetableUpdatedSubject,
  timetableUpdatedHtml,
  timetableUpdatedText,
} from './templates'
import type { EventEmailData } from './templates'
import { formatDate } from '@/lib/utils/slug'
import { getServerAppUrl } from '@/lib/utils/app-url'
import type { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
  //
  // MGT-082: canonical public URL is nested under the org slug, so the
  // owning organisation's slug must be joined in here. The join is `!inner`
  // so an event with a missing/invalid org is skipped rather than sent with
  // a broken link.
  const { data: event } = await supabase
    .from('events')
    .select('slug, title, venue, start_date, end_date, notification_emails, organisations!inner(slug)')
    .eq('id', eventId)
    .maybeSingle()

  if (!event) return
  const orgRow = (event as typeof event & { organisations: { slug: string } | { slug: string }[] }).organisations
  const orgSlug = Array.isArray(orgRow) ? orgRow[0]?.slug : orgRow?.slug
  if (!orgSlug) return

  // ── 2. Normalise recipients to lowercase, skip if none ──────────────────
  const rawRecipients = event.notification_emails ?? []
  if (rawRecipients.length === 0) return
  const recipients = rawRecipients.map((e: string) => e.toLowerCase())

  // ── 3. Ensure preference rows exist & fetch preferences ─────────────────
  const admin = createAdminClient()

  // Upsert preference rows for all recipients (no-op if already exists).
  // Track any failures so we can surface them — a missing preference row
  // means we cannot generate an unsubscribe token for that recipient, and
  // we refuse to send without a working unsubscribe link. Failures are
  // reported to Sentry; other recipients' sends still proceed.
  const upsertFailedEmails = new Set<string>()
  for (const email of recipients) {
    const { error: upsertError } = await admin
      .from('notification_preferences')
      .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true })
    if (upsertError) {
      upsertFailedEmails.add(email)
      Sentry.captureException(upsertError, {
        tags: { action: 'sendEventNotification.preferenceUpsert' },
        extra: { eventId, email, type },
      })
    }
  }

  // Fetch preferences for all recipients
  const { data: prefs, error: prefsError } = await admin
    .from('notification_preferences')
    .select('email, token, unsubscribed')
    .in('email', recipients)

  if (prefsError) {
    Sentry.captureException(prefsError, {
      tags: { action: 'sendEventNotification.preferenceFetch' },
      extra: { eventId, type },
    })
  }

  const prefMap = new Map(
    (prefs ?? []).map((p) => [p.email, { token: p.token, unsubscribed: p.unsubscribed }])
  )

  // ── 4. Build shared email data (subject + base data) ────────────────────
  const dateRange =
    event.start_date === event.end_date
      ? formatDate(event.start_date)
      : `${formatDate(event.start_date)} – ${formatDate(event.end_date)}`

  const appUrl = getServerAppUrl()
  const publicUrl = `${appUrl}/${orgSlug}/${event.slug}`

  const subject =
    type === 'event.published'
      ? eventPublishedSubject(event.title)
      : timetableUpdatedSubject(event.title)

  // ── 5. Send via Resend — one send per recipient, debounce + log each ────
  const resend = getResendClient()
  const from = getFromAddress()
  const now = new Date().toISOString()
  const windowMs = DEBOUNCE_MS[type]
  const windowStart = new Date(Date.now() - windowMs).toISOString()

  for (const to of recipients) {
    debugLog('sendEventNotification', 'recipient:', to)

    // Skip unsubscribed recipients silently
    const pref = prefMap.get(to)
    if (pref?.unsubscribed) {
      debugLog('sendEventNotification', 'SKIP unsubscribed:', to)
      continue
    }

    // No preference row found — this only happens if the upsert above failed
    // or the fetch failed. We refuse to send without a token-based unsubscribe
    // link (no List-Unsubscribe compliance) and record a failed notification
    // so the failure is visible in notification_log and in Sentry.
    if (!pref) {
      debugLog('sendEventNotification', 'SKIP no preference row:', to)
      const reason = upsertFailedEmails.has(to)
        ? 'Preference row upsert failed — unsubscribe link unavailable.'
        : 'Preference row missing after upsert — unsubscribe link unavailable.'
      await supabase.from('notification_log').insert({
        event_id: eventId,
        type,
        recipient_email: to,
        status: 'failed',
        error: reason,
        sent_at: null,
      })
      continue
    }

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

    // Build per-recipient email data with unsubscribe URL
    const unsubscribeUrl = pref?.token
      ? `${appUrl}/notifications/unsubscribe/${pref.token}`
      : undefined

    const emailData: EventEmailData = {
      eventTitle: event.title,
      venue: event.venue,
      dateRange,
      publicUrl,
      unsubscribeUrl,
    }

    const html =
      type === 'event.published'
        ? eventPublishedHtml(emailData)
        : timetableUpdatedHtml(emailData)

    const text =
      type === 'event.published'
        ? eventPublishedText(emailData)
        : timetableUpdatedText(emailData)

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
      const headers: Record<string, string> = {}
      if (unsubscribeUrl) {
        headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`
      }

      const { error: sendError } = await resend.emails.send({
        from,
        to,
        subject,
        html,
        text,
        headers,
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
      Sentry.captureException(err, { tags: { action: 'sendEventNotification', recipient: to } })
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
