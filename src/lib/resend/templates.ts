/**
 * Email templates for Phase 5 notifications.
 *
 * Design principles:
 *   - Plain, readable HTML — no complex layout, no images
 *   - Works in all major email clients
 *   - Mobile-friendly single-column layout
 *   - Clear CTA with the public timetable link
 */

export interface EventEmailData {
  eventTitle: string
  venue: string | null
  dateRange: string        // e.g. "Sat 15 Mar" or "Sat 15 Mar – Sun 16 Mar"
  publicUrl: string        // full URL to the public timetable page
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const BASE_STYLES = `
  body { margin: 0; padding: 0; background: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; }
  .wrap { max-width: 560px; margin: 40px auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  .header { padding: 24px 32px; border-bottom: 1px solid #f3f4f6; }
  .header .wordmark { font-size: 13px; font-weight: 600; color: #6b7280; letter-spacing: 0.04em; text-transform: uppercase; }
  .body { padding: 32px; }
  .body h1 { margin: 0 0 6px; font-size: 20px; font-weight: 700; line-height: 1.3; color: #111827; }
  .body .meta { margin: 0 0 28px; font-size: 14px; color: #6b7280; line-height: 1.5; }
  .cta { display: inline-block; padding: 12px 24px; background: #111827; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; }
  .footer { padding: 20px 32px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; }
`

function buildMetaLine(venue: string | null, dateRange: string): string {
  return [venue, dateRange].filter(Boolean).join(' · ')
}

// ---------------------------------------------------------------------------
// Template: event published
// ---------------------------------------------------------------------------

export function eventPublishedSubject(eventTitle: string): string {
  return `${eventTitle} — Timetable Published`
}

export function eventPublishedHtml(data: EventEmailData): string {
  const meta = buildMetaLine(data.venue, data.dateRange)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(data.eventTitle)} — Timetable Published</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <span class="wordmark">MyGridTime</span>
    </div>
    <div class="body">
      <h1>${escHtml(data.eventTitle)}</h1>
      <p class="meta">${escHtml(meta)}</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 28px;color:#374151;">
        The timetable for this event has been published and is now publicly accessible.
      </p>
      <a href="${escHtml(data.publicUrl)}" class="cta">View timetable</a>
    </div>
    <div class="footer">
      You received this email because your address is on the notification list for this event.<br />
      <a href="${escHtml(data.publicUrl)}" style="color:#6b7280;">${escHtml(data.publicUrl)}</a>
    </div>
  </div>
</body>
</html>`
}

export function eventPublishedText(data: EventEmailData): string {
  const meta = buildMetaLine(data.venue, data.dateRange)
  return [
    `MyGridTime`,
    ``,
    `${data.eventTitle}`,
    meta,
    ``,
    `The timetable for this event has been published and is now publicly accessible.`,
    ``,
    `View timetable: ${data.publicUrl}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Template: timetable updated
// ---------------------------------------------------------------------------

export function timetableUpdatedSubject(eventTitle: string): string {
  return `${eventTitle} — Timetable Updated`
}

export function timetableUpdatedHtml(data: EventEmailData): string {
  const meta = buildMetaLine(data.venue, data.dateRange)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(data.eventTitle)} — Timetable Updated</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <span class="wordmark">MyGridTime</span>
    </div>
    <div class="body">
      <h1>${escHtml(data.eventTitle)}</h1>
      <p class="meta">${escHtml(meta)}</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 28px;color:#374151;">
        The timetable for this event has been updated. Please check the latest schedule before the event.
      </p>
      <a href="${escHtml(data.publicUrl)}" class="cta">View updated timetable</a>
    </div>
    <div class="footer">
      You received this email because your address is on the notification list for this event.<br />
      <a href="${escHtml(data.publicUrl)}" style="color:#6b7280;">${escHtml(data.publicUrl)}</a>
    </div>
  </div>
</body>
</html>`
}

export function timetableUpdatedText(data: EventEmailData): string {
  const meta = buildMetaLine(data.venue, data.dateRange)
  return [
    `MyGridTime`,
    ``,
    `${data.eventTitle}`,
    meta,
    ``,
    `The timetable for this event has been updated. Please check the latest schedule before the event.`,
    ``,
    `View updated timetable: ${data.publicUrl}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Minimal HTML escaping for values interpolated into templates. */
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
