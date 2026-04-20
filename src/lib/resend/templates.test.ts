import { describe, it, expect } from 'vitest'
import {
  eventPublishedSubject,
  eventPublishedHtml,
  eventPublishedText,
  timetableUpdatedSubject,
  timetableUpdatedHtml,
  timetableUpdatedText,
  orgInviteSubject,
  orgInviteHtml,
  orgInviteText,
} from './templates'

const eventData = {
  eventTitle: 'Round 3',
  venue: 'Whilton Mill',
  dateRange: 'Sat 10 May',
  publicUrl: 'https://mygridtime.com/round-3',
}

const eventDataWithUnsub = {
  ...eventData,
  unsubscribeUrl: 'https://mygridtime.com/notifications/unsubscribe/abc-token-123',
}

const inviteData = {
  orgName: 'Test Org',
  inviterEmail: 'admin@example.com',
  role: 'editor',
  acceptUrl: 'https://mygridtime.com/invites/abc123',
}

describe('event published templates', () => {
  it('subject includes event title', () => {
    expect(eventPublishedSubject('Round 3')).toContain('Round 3')
  })

  it('HTML contains event title and public URL', () => {
    const html = eventPublishedHtml(eventData)
    expect(html).toContain('Round 3')
    expect(html).toContain('https://mygridtime.com/round-3')
  })

  it('text contains event title and public URL', () => {
    const text = eventPublishedText(eventData)
    expect(text).toContain('Round 3')
    expect(text).toContain('https://mygridtime.com/round-3')
  })

  it('HTML contains unsubscribe link when provided', () => {
    const html = eventPublishedHtml(eventDataWithUnsub)
    expect(html).toContain('Unsubscribe from notifications')
    expect(html).toContain('notifications/unsubscribe/abc-token-123')
  })

  it('text contains unsubscribe link when provided', () => {
    const text = eventPublishedText(eventDataWithUnsub)
    expect(text).toContain('Unsubscribe:')
    expect(text).toContain('notifications/unsubscribe/abc-token-123')
  })

  it('HTML omits unsubscribe link when not provided', () => {
    const html = eventPublishedHtml(eventData)
    expect(html).not.toContain('Unsubscribe from notifications')
  })

  it('text omits unsubscribe link when not provided', () => {
    const text = eventPublishedText(eventData)
    expect(text).not.toContain('Unsubscribe')
  })
})

describe('timetable updated templates', () => {
  it('subject includes event title', () => {
    expect(timetableUpdatedSubject('Round 3')).toContain('Round 3')
  })

  it('HTML contains event title and venue', () => {
    const html = timetableUpdatedHtml(eventData)
    expect(html).toContain('Round 3')
    expect(html).toContain('Whilton Mill')
  })

  it('text contains public URL', () => {
    const text = timetableUpdatedText(eventData)
    expect(text).toContain('https://mygridtime.com/round-3')
  })

  it('HTML contains unsubscribe link when provided', () => {
    const html = timetableUpdatedHtml(eventDataWithUnsub)
    expect(html).toContain('Unsubscribe from notifications')
    expect(html).toContain('notifications/unsubscribe/abc-token-123')
  })

  it('text contains unsubscribe link when provided', () => {
    const text = timetableUpdatedText(eventDataWithUnsub)
    expect(text).toContain('Unsubscribe:')
    expect(text).toContain('notifications/unsubscribe/abc-token-123')
  })
})

describe('org invite templates', () => {
  it('subject includes org name', () => {
    expect(orgInviteSubject('Test Org')).toContain('Test Org')
  })

  it('HTML contains accept URL and role', () => {
    const html = orgInviteHtml(inviteData)
    expect(html).toContain('https://mygridtime.com/invites/abc123')
    expect(html).toContain('editor')
  })

  it('text contains accept URL', () => {
    const text = orgInviteText(inviteData)
    expect(text).toContain('https://mygridtime.com/invites/abc123')
  })
})

describe('HTML escaping', () => {
  it('escapes HTML special characters in event title', () => {
    const html = eventPublishedHtml({
      ...eventData,
      eventTitle: '<script>alert("xss")</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes HTML special characters in invite org name', () => {
    const html = orgInviteHtml({
      ...inviteData,
      orgName: 'Org & "Friends"',
    })
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
  })
})
