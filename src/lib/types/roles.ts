// MGT-084 — Discriminated union for the header role badge.
//
// Resolution order lives in src/lib/utils/role-badge.ts.
// The UI renders each kind with a distinct visual treatment; staff/support
// MUST NOT be labelled as 'Owner' even though get_user_org_role() grants
// them effective owner access via DEC-018.

export type UserBadge =
  | { kind: 'admin' }
  | { kind: 'platform'; role: 'staff' | 'support'; orgName: string; orgId: string }
  | { kind: 'org'; role: 'owner' | 'editor'; orgName: string; orgId: string }
  | { kind: 'subscription'; level: 'member' | 'subscriber' }
