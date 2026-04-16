// Character limits for admin event/org editing forms.
// Enforced at the input layer via native `maxLength` with a visible `CharCounter`.
// No DB constraints; no server-side length validation in this pass.
//
// Values are intentionally generous — the goal is to prevent pathological input
// (pasted documents, accidental keyholds, buffer-style abuse) rather than
// impose product policy. Tighten as needed in a follow-up pass once usage data
// is in.

export const FIELD_LIMITS = {
  event: {
    title: 120,
    venue: 120,
    notes: 1000,
    notificationEmails: 1000,
    dayLabel: 60,
    templateName: 120,
  },
  entry: {
    title: 120,
    category: 60,
    notes: 200,
  },
  org: {
    name: 120,
    slug: 64,
    primaryColor: 7,
    logoUrl: 500,
    headerText: 80,
    inviteEmail: 254,
  },
} as const
