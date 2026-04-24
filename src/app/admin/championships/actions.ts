'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { setActiveChampionshipId, getActiveChampionship } from '@/lib/utils/active-championship'
import { getResendClient, getFromAddress } from '@/lib/resend/client'
import { getServerAppUrl } from '@/lib/utils/app-url'
import { orgInviteSubject, orgInviteHtml, orgInviteText } from '@/lib/resend/templates'
import type { ChampionshipBranding } from '@/lib/types/database'
import { isReservedSlug } from '@/lib/constants/reserved-slugs'
import { writeAuditLog, makeActorContext } from '@/lib/audit'
import * as Sentry from '@sentry/nextjs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return { supabase, user }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Creates a new championship and makes the current user its owner.
 * Uses the admin client to insert the initial org_members row (bypasses RLS).
 */
export async function createChampionship(input: {
  name: string
  slug: string
}): Promise<ActionResult<{ id: string; isFirstChampionship: boolean }>> {
  try {
    const { supabase, user } = await requireUser()

    const name = input.name.trim()
    const slug = input.slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')

    if (!name) return { success: false, error: 'Championship name is required.' }
    if (!slug) return { success: false, error: 'Slug is required.' }
    if (slug.length < 2) return { success: false, error: 'Slug must be at least 2 characters.' }

    // Reject slugs that collide with a reserved top-level path (e.g. /admin,
    // /api, /privacy, /o, …). The public championship page lives at
    // `/{championshipSlug}` and shares the top-level namespace with both the
    // per-event public page (`/{eventSlug}`) and a fixed list of static /
    // framework paths.
    if (isReservedSlug(slug)) {
      return { success: false, error: 'That slug is reserved. Please choose a different one.' }
    }

    // Detect whether this will be the user's first championship BEFORE the
    // new membership row is inserted. Uses the authenticated client — the
    // user can always see their own org_members rows under RLS. A failure
    // here must not block creation; default to false (subsequent-championship
    // behaviour) so we never route a returning user to the first-run path.
    let isFirstChampionship = false
    const { count: priorMembershipCount, error: priorCountError } = await supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (priorCountError) {
      Sentry.captureException(priorCountError, { tags: { action: 'createOrganisation.priorCount' } })
    } else {
      isFirstChampionship = (priorMembershipCount ?? 0) === 0
    }

    const admin = createAdminClient()

    // Check slug uniqueness across championships via admin client
    const { data: existingChampionship } = await admin
      .from('organisations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (existingChampionship) return { success: false, error: 'That slug is already taken.' }

    // Public championship pages and per-event public pages share the
    // top-level route namespace (`/{slug}`), so a new championship slug must
    // not collide with any existing event slug. Soft-deleted events are
    // included — their slug rows remain in the table and could be
    // recovered, so the namespace must remain reserved.
    const { data: existingEvent } = await admin
      .from('events')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (existingEvent) return { success: false, error: 'That slug is already taken.' }

    // Insert championship via admin client (bypasses RLS)
    const { data: championship, error: championshipError } = await admin
      .from('organisations')
      .insert({ name, slug })
      .select('id')
      .single()

    if (championshipError || !championship) {
      if (championshipError) {
        Sentry.captureException(championshipError, { tags: { action: 'createOrganisation.insertOrg' } })
      }
      return { success: false, error: 'Could not create the championship. Please retry.' }
    }

    // Insert owner membership via admin client (bypasses RLS)
    const { error: memberError } = await admin
      .from('org_members')
      .insert({ org_id: championship.id, user_id: user.id, role: 'owner' })

    if (memberError) {
      // Clean up the championship if membership insert fails
      await admin.from('organisations').delete().eq('id', championship.id)
      Sentry.captureException(memberError, { tags: { action: 'createOrganisation.insertMember' } })
      return { success: false, error: 'Could not create the championship. Please retry.' }
    }

    // Audit row — written via the authenticated client after the owner
    // membership has committed, so RLS sees get_user_org_role(org.id) = 'owner'.
    // Creator is by construction a genuine new member, so via: 'membership'.
    await writeAuditLog(
      supabase,
      user.id,
      { championshipId: championship.id },
      'organisation.created',
      { org_id: championship.id, name, slug },
      { via: 'membership' },
    )

    // Post-commit side effects: the DB write has already succeeded, so a
    // failure here must not flip the user-facing result to an error. Any
    // exception (cookie write, cache revalidation) is captured to Sentry
    // and swallowed so the caller still sees { success: true }.
    try {
      setActiveChampionshipId(championship.id)
      revalidatePath('/admin')
    } catch (postCommitErr) {
      Sentry.captureException(postCommitErr, { tags: { action: 'createOrganisation.postCommit' } })
    }

    return { success: true, data: { id: championship.id, isFirstChampionship } }
  } catch (err) {
    // Catch any unexpected exception so the server action never crashes the page
    Sentry.captureException(err, { tags: { action: 'createOrganisation' } })
    return { success: false, error: 'Could not create the championship. Please retry.' }
  }
}

/**
 * Switches the active championship for the current user.
 * Validates membership before setting the cookie.
 */
export async function switchChampionship(championshipId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()

  // Verify the user is a member of this championship
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('org_id', championshipId)
    .maybeSingle()

  if (!membership) return { success: false, error: 'You are not a member of this championship.' }

  setActiveChampionshipId(championshipId)
  revalidatePath('/admin', 'layout')

  return { success: true, data: undefined }
}

// ---------------------------------------------------------------------------
// Championship Settings
// ---------------------------------------------------------------------------

/**
 * Require the current user to be owner or admin of the active championship.
 * Returns the supabase client, user, and active championship.
 */
async function requireOwner() {
  const { supabase, user } = await requireUser()
  const activeChampionship = await getActiveChampionship(supabase, user.id)
  if (!activeChampionship) redirect('/admin')
  if (activeChampionship.role !== 'owner') {
    return { supabase, user, activeChampionship, authorized: false as const }
  }
  return { supabase, user, activeChampionship, authorized: true as const }
}

/**
 * Updates the championship name.
 */
export async function updateChampionship(input: {
  championshipId: string
  name: string
}): Promise<ActionResult> {
  const { supabase, user, activeChampionship, authorized } = await requireOwner()
  if (!authorized) return { success: false, error: 'Only owners can update championship settings.' }

  const name = input.name.trim()
  if (!name) return { success: false, error: 'Championship name is required.' }

  // Pre-fetch current name so the audit row captures the diff and can be
  // suppressed on a no-op save, consistent with event.updated / event_day.label_updated.
  const { data: current } = await supabase
    .from('organisations')
    .select('name')
    .eq('id', input.championshipId)
    .maybeSingle()

  const { error } = await supabase
    .from('organisations')
    .update({ name })
    .eq('id', input.championshipId)

  if (error) {
    Sentry.captureException(error, { tags: { action: 'updateOrganisation.update' } })
    return { success: false, error: 'Could not update the championship. Please retry.' }
  }

  const previousName = current?.name ?? null
  if (previousName !== name) {
    await writeAuditLog(
      supabase,
      user.id,
      { championshipId: input.championshipId },
      'organisation.updated',
      { changes: { name: { from: previousName, to: name } } },
      makeActorContext(activeChampionship),
    )
  }

  revalidatePath('/admin')
  return { success: true, data: undefined }
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

/** Hex colour regex: #rgb or #rrggbb */
const HEX_RE = /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/

/**
 * Updates the championship branding. Owner/admin only.
 * Stores null when all fields are cleared.
 */
export async function updateChampionshipBranding(input: {
  championshipId: string
  branding: ChampionshipBranding
}): Promise<ActionResult> {
  const { supabase, user, activeChampionship, authorized } = await requireOwner()
  if (!authorized) return { success: false, error: 'Only owners can update branding.' }

  const { primaryColor, logoUrl, headerText } = input.branding

  if (primaryColor && !HEX_RE.test(primaryColor)) {
    return { success: false, error: 'Primary colour must be a valid hex value (e.g. #ff0000 or #f00).' }
  }

  // Pre-fetch current branding so the audit row captures a per-field diff
  // and can be suppressed on a no-op save.
  const { data: currentRow } = await supabase
    .from('organisations')
    .select('branding')
    .eq('id', input.championshipId)
    .maybeSingle()

  // Build the stored object; omit empty fields so jsonb stays clean.
  // If everything is empty, store null on the column.
  const stored: Record<string, string> = {}
  if (primaryColor?.trim()) stored.primaryColor = primaryColor.trim()
  if (logoUrl?.trim())      stored.logoUrl      = logoUrl.trim()
  if (headerText?.trim())   stored.headerText   = headerText.trim()

  const brandingValue = Object.keys(stored).length > 0 ? stored : null

  const { error } = await supabase
    .from('organisations')
    .update({ branding: brandingValue })
    .eq('id', input.championshipId)

  if (error) {
    Sentry.captureException(error, { tags: { action: 'updateOrgBranding.update' } })
    return { success: false, error: 'Could not save branding. Please retry.' }
  }

  const previousBranding = (currentRow?.branding ?? null) as ChampionshipBranding | null
  const nextBranding = brandingValue as ChampionshipBranding | null
  const fields: Array<keyof ChampionshipBranding> = ['primaryColor', 'logoUrl', 'headerText']
  const changes: Record<string, { from: string | null; to: string | null }> = {}
  for (const field of fields) {
    const from = (previousBranding?.[field] ?? null) || null
    const to   = (nextBranding?.[field]     ?? null) || null
    if (from !== to) {
      changes[field] = { from, to }
    }
  }

  if (Object.keys(changes).length > 0) {
    await writeAuditLog(
      supabase,
      user.id,
      { championshipId: input.championshipId },
      'organisation.branding_updated',
      { changes },
      makeActorContext(activeChampionship),
    )
  }

  revalidatePath('/admin')
  return { success: true, data: undefined }
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/**
 * Lists members of the active championship. Owner/admin only.
 */
export async function listChampionshipMembers(championshipId: string): Promise<ActionResult<Array<{
  id: string
  user_id: string
  role: string
  email: string
  created_at: string
}>>> {
  const { authorized } = await requireOwner()
  if (!authorized) return { success: false, error: 'Only owners can view members.' }

  // Use admin client so the users join returns emails for all members,
  // not just the current user (users_select_own RLS blocks cross-user reads)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('org_members')
    .select('id, user_id, role, created_at, users!org_members_user_id_fkey(email)')
    .eq('org_id', championshipId)
    .order('created_at', { ascending: true })

  if (error) {
    Sentry.captureException(error, { tags: { action: 'listOrgMembers.select' } })
    return { success: false, error: 'Could not load members. Please retry.' }
  }

  const members = (data ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    email: (m.users as unknown as { email: string })?.email ?? 'unknown',
    created_at: m.created_at,
  }))

  return { success: true, data: members }
}

/**
 * Updates a member's role. Cannot change last owner.
 */
export async function updateMemberRole(input: {
  memberId: string
  championshipId: string
  newRole: 'owner' | 'editor'
}): Promise<ActionResult> {
  const { supabase, user, activeChampionship, authorized } = await requireOwner()
  if (!authorized) return { success: false, error: 'Only owners can change roles.' }

  // Fetch the member being changed — include email join for audit detail.
  // users RLS is self-only (users_select_own), so the email join may return
  // null for other members; the audit row still writes with target_user_id.
  const { data: member } = await supabase
    .from('org_members')
    .select('id, user_id, role, users!org_members_user_id_fkey(email)')
    .eq('id', input.memberId)
    .eq('org_id', input.championshipId)
    .single()

  if (!member) return { success: false, error: 'Member not found.' }

  const previousRole = member.role
  const targetEmail = (member.users as unknown as { email: string } | null)?.email ?? null

  // Prevent demoting last owner
  if (previousRole === 'owner' && input.newRole !== 'owner') {
    const { count } = await supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', input.championshipId)
      .eq('role', 'owner')

    if ((count ?? 0) <= 1) {
      return { success: false, error: 'Cannot change role — this is the only owner.' }
    }
  }

  const { error } = await supabase
    .from('org_members')
    .update({ role: input.newRole })
    .eq('id', input.memberId)

  if (error) {
    Sentry.captureException(error, { tags: { action: 'updateMemberRole.update' } })
    return { success: false, error: "Could not update this member's role. Please retry." }
  }

  if (previousRole !== input.newRole) {
    await writeAuditLog(
      supabase,
      user.id,
      { championshipId: input.championshipId },
      'org_member.role_updated',
      {
        org_id: input.championshipId,
        target_user_id: member.user_id,
        target_email: targetEmail,
        changes: { role: { from: previousRole, to: input.newRole } },
      },
      makeActorContext(activeChampionship),
    )
  }

  revalidatePath('/admin')
  return { success: true, data: undefined }
}

/**
 * Removes a member from the championship. Cannot remove last owner.
 */
export async function removeMember(input: {
  memberId: string
  championshipId: string
}): Promise<ActionResult> {
  const { supabase, user, activeChampionship, authorized } = await requireOwner()
  if (!authorized) return { success: false, error: 'Only owners can remove members.' }

  // Fetch the member being removed — include user_id + email join for audit
  // detail. Captured pre-delete so the detail survives the delete. users RLS
  // (users_select_own) may null out the email for non-self rows; audit still
  // writes with target_user_id.
  const { data: member } = await supabase
    .from('org_members')
    .select('id, user_id, role, users!org_members_user_id_fkey(email)')
    .eq('id', input.memberId)
    .eq('org_id', input.championshipId)
    .single()

  if (!member) return { success: false, error: 'Member not found.' }

  const previousRole = member.role
  const targetUserId = member.user_id
  const targetEmail = (member.users as unknown as { email: string } | null)?.email ?? null

  // MGT-098: prevent acting user from removing their own membership row. Fires
  // before the last-owner check so a sole-owner self-remove attempt surfaces
  // the self-specific copy rather than the generic "only owner" message.
  if (targetUserId === user.id) {
    return {
      success: false,
      error: 'You cannot remove yourself from this championship. Ask another owner to remove you, or switch championships first.',
    }
  }

  // Prevent removing last owner
  if (previousRole === 'owner') {
    const { count } = await supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', input.championshipId)
      .eq('role', 'owner')

    if ((count ?? 0) <= 1) {
      return { success: false, error: 'Cannot remove the only owner.' }
    }
  }

  const { error } = await supabase
    .from('org_members')
    .delete()
    .eq('id', input.memberId)

  if (error) {
    Sentry.captureException(error, { tags: { action: 'removeMember.delete' } })
    return { success: false, error: 'Could not remove this member. Please retry.' }
  }

  await writeAuditLog(
    supabase,
    user.id,
    { championshipId: input.championshipId },
    'org_member.removed',
    {
      org_id: input.championshipId,
      target_user_id: targetUserId,
      target_email: targetEmail,
      previous_role: previousRole,
    },
    makeActorContext(activeChampionship),
  )

  revalidatePath('/admin')
  return { success: true, data: undefined }
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

/**
 * Lists pending invites for the championship.
 */
export async function listChampionshipInvites(championshipId: string): Promise<ActionResult<Array<{
  id: string
  email: string
  role: string
  created_at: string
}>>> {
  const { supabase, authorized } = await requireOwner()
  if (!authorized) return { success: false, error: 'Only owners can view invites.' }

  const { data, error } = await supabase
    .from('org_invites')
    .select('id, email, role, created_at')
    .eq('org_id', championshipId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    Sentry.captureException(error, { tags: { action: 'listOrgInvites.select' } })
    return { success: false, error: 'Could not load pending invites. Please retry.' }
  }
  return { success: true, data: data ?? [] }
}

/**
 * Invites a user by email to the championship. Sends invite email via Resend.
 * Uses the admin client for all DB writes to avoid RLS ambiguity on new tables.
 */
export async function inviteMember(input: {
  championshipId: string
  email: string
  role: 'editor'
}): Promise<ActionResult> {
  try {
    const { supabase, user, activeChampionship, authorized } = await requireOwner()
    if (!authorized) return { success: false, error: 'Only owners can invite members.' }

    const email = input.email.trim().toLowerCase()
    if (!email) return { success: false, error: 'Email is required.' }

    const admin = createAdminClient()

    // Check if already a member (look up by email via admin client)
    const { data: existingUser } = await admin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingUser) {
      const { data: existingMember } = await admin
        .from('org_members')
        .select('id')
        .eq('org_id', input.championshipId)
        .eq('user_id', existingUser.id)
        .maybeSingle()

      if (existingMember) {
        return { success: false, error: 'This user is already a member of the championship.' }
      }
    }

    // Insert invite via admin client — bypasses RLS so RETURNING always works
    const { data: invite, error: insertError } = await admin
      .from('org_invites')
      .insert({
        org_id: input.championshipId,
        email,
        role: input.role,
        invited_by: user.id,
      })
      .select('id, token')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return { success: false, error: 'A pending invite already exists for this email.' }
      }
      Sentry.captureException(insertError, { tags: { action: 'inviteMember.insertInvite' } })
      return { success: false, error: 'Could not create this invite. Please retry.' }
    }

    if (!invite) {
      return { success: false, error: 'Failed to create invite.' }
    }

    await writeAuditLog(
      supabase,
      user.id,
      { championshipId: input.championshipId },
      'org_member.invited',
      { org_id: input.championshipId, email, role: input.role, invite_id: invite.id },
      makeActorContext(activeChampionship),
    )

    // Fetch championship name for the email (use user client — RLS allows member read)
    const { data: championship } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', input.championshipId)
      .maybeSingle()

    // Send invite email — failure never blocks invite creation
    const resend = getResendClient()
    if (resend && championship) {
      const acceptUrl = `${getServerAppUrl()}/invites/${invite.token}`

      try {
        await resend.emails.send({
          from: getFromAddress(),
          to: email,
          subject: orgInviteSubject(championship.name),
          html: orgInviteHtml({
            orgName: championship.name,
            inviterEmail: user.email ?? 'unknown',
            role: input.role,
            acceptUrl,
          }),
          text: orgInviteText({
            orgName: championship.name,
            inviterEmail: user.email ?? 'unknown',
            role: input.role,
            acceptUrl,
          }),
        })
      } catch (err) {
        // Email failure is non-fatal — invite is already created
        Sentry.captureException(err, { tags: { action: 'inviteMember.email' } })
      }
    }

    revalidatePath('/admin')
    return { success: true, data: undefined }
  } catch (err) {
    // Catch any unexpected exception so the server action never crashes the page
    Sentry.captureException(err, { tags: { action: 'inviteMember' } })
    return { success: false, error: 'Could not send the invite. Please retry.' }
  }
}

/**
 * Revokes (deletes) a pending invite.
 */
export async function revokeInvite(input: {
  inviteId: string
  championshipId: string
}): Promise<ActionResult> {
  const { supabase, user, activeChampionship, authorized } = await requireOwner()
  if (!authorized) return { success: false, error: 'Only owners can revoke invites.' }

  // Capture email pre-delete so the audit row records who was invited.
  const { data: inviteRow } = await supabase
    .from('org_invites')
    .select('email')
    .eq('id', input.inviteId)
    .eq('org_id', input.championshipId)
    .maybeSingle()

  const { error } = await supabase
    .from('org_invites')
    .delete()
    .eq('id', input.inviteId)
    .eq('org_id', input.championshipId)

  if (error) {
    Sentry.captureException(error, { tags: { action: 'revokeInvite.delete' } })
    return { success: false, error: 'Could not revoke this invite. Please retry.' }
  }

  await writeAuditLog(
    supabase,
    user.id,
    { championshipId: input.championshipId },
    'org_member.invite_revoked',
    { org_id: input.championshipId, invite_id: input.inviteId, email: inviteRow?.email ?? null },
    makeActorContext(activeChampionship),
  )

  revalidatePath('/admin')
  return { success: true, data: undefined }
}

/**
 * Accepts an invite by token. Uses service-role client for insert.
 * Validates: token exists, not already accepted, email matches user.
 */
export async function acceptInvite(token: string): Promise<ActionResult<{ championshipId: string; role: string }>> {
  const { supabase, user } = await requireUser()

  const admin = createAdminClient()

  // Fetch invite by token
  const { data: invite, error: fetchError } = await admin
    .from('org_invites')
    .select('id, org_id, email, role, accepted_at')
    .eq('token', token)
    .single()

  if (fetchError || !invite) {
    return { success: false, error: 'Invite not found or has expired.' }
  }

  if (invite.accepted_at) {
    return { success: false, error: 'This invite has already been accepted.' }
  }

  // Validate email matches
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return {
      success: false,
      error: `This invite was sent to ${invite.email}. Please sign in with that email address.`,
    }
  }

  // Check not already a member
  const { data: existingMember } = await admin
    .from('org_members')
    .select('id')
    .eq('org_id', invite.org_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingMember) {
    // Already a member — still mark the invite as accepted so it disappears
    // from the pending list. If the update fails, surface it: a silently
    // unchecked update leaves a stale pending invite behind forever.
    const { error: markError } = await admin
      .from('org_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    if (markError) {
      Sentry.captureException(markError, { tags: { action: 'acceptInvite.markAcceptedExisting' } })
      return { success: false, error: 'Could not mark the invite as accepted. Please try again.' }
    }

    return { success: true, data: { championshipId: invite.org_id, role: invite.role } }
  }

  // Insert membership
  const { error: memberError } = await admin
    .from('org_members')
    .insert({
      org_id: invite.org_id,
      user_id: user.id,
      role: invite.role,
    })

  if (memberError) {
    Sentry.captureException(memberError, { tags: { action: 'acceptInvite.insertMember' } })
    return { success: false, error: 'Could not add you to the championship. Please try again.' }
  }

  // Mark invite as accepted. Error-check the update — if this fails, the
  // member row is already inserted so the user DOES have access, but the
  // invite row is left with accepted_at = null and would show as "pending"
  // forever. Surface the failure so the caller can retry / raise an alert
  // rather than silently reporting success.
  const { error: markError } = await admin
    .from('org_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  if (markError) {
    Sentry.captureException(markError, { tags: { action: 'acceptInvite.markAccepted' } })
    return {
      success: false,
      error: 'You have been added to the championship, but the invite could not be marked as accepted. Please refresh and try again.',
    }
  }

  await writeAuditLog(
    supabase,
    user.id,
    { championshipId: invite.org_id },
    'org_member.invite_accepted',
    { org_id: invite.org_id, invite_id: invite.id, role: invite.role },
    { via: 'membership' },
  )

  // Set active championship to the one they just joined
  setActiveChampionshipId(invite.org_id)

  return { success: true, data: { championshipId: invite.org_id, role: invite.role } }
}
