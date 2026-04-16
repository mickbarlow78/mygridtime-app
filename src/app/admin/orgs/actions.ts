'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { setActiveOrgId, getActiveOrg } from '@/lib/utils/active-org'
import { getResendClient, getFromAddress } from '@/lib/resend/client'
import { getServerAppUrl } from '@/lib/utils/app-url'
import { orgInviteSubject, orgInviteHtml, orgInviteText } from '@/lib/resend/templates'
import type { OrgBranding } from '@/lib/types/database'
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
 * Creates a new organisation and makes the current user its owner.
 * Uses the admin client to insert the initial org_members row (bypasses RLS).
 */
export async function createOrganisation(input: {
  name: string
  slug: string
}): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser()

  const name = input.name.trim()
  const slug = input.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!name) return { success: false, error: 'Organisation name is required.' }
  if (!slug) return { success: false, error: 'Slug is required.' }
  if (slug.length < 2) return { success: false, error: 'Slug must be at least 2 characters.' }

  const admin = createAdminClient()

  // Check slug uniqueness via admin client
  const { data: existing } = await admin
    .from('organisations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (existing) return { success: false, error: 'That slug is already taken.' }

  // Insert organisation via admin client (bypasses RLS)
  const { data: org, error: orgError } = await admin
    .from('organisations')
    .insert({ name, slug })
    .select('id')
    .single()

  if (orgError || !org) {
    if (orgError) {
      Sentry.captureException(orgError, { tags: { action: 'createOrganisation.insertOrg' } })
    }
    return { success: false, error: 'Could not create the organisation. Please retry.' }
  }

  // Insert owner membership via admin client (bypasses RLS)
  const { error: memberError } = await admin
    .from('org_members')
    .insert({ org_id: org.id, user_id: user.id, role: 'owner' })

  if (memberError) {
    // Clean up the org if membership insert fails
    await admin.from('organisations').delete().eq('id', org.id)
    Sentry.captureException(memberError, { tags: { action: 'createOrganisation.insertMember' } })
    return { success: false, error: 'Could not create the organisation. Please retry.' }
  }

  // Set active org cookie to the new org
  setActiveOrgId(org.id)
  revalidatePath('/admin')

  return { success: true, data: { id: org.id } }
}

/**
 * Switches the active organisation for the current user.
 * Validates membership before setting the cookie.
 */
export async function switchOrg(orgId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()

  // Verify the user is a member of this org
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!membership) return { success: false, error: 'You are not a member of this organisation.' }

  setActiveOrgId(orgId)
  revalidatePath('/admin')

  return { success: true, data: undefined }
}

// ---------------------------------------------------------------------------
// Org Settings
// ---------------------------------------------------------------------------

/**
 * Require the current user to be owner or admin of the active org.
 * Returns the supabase client, user, and active org.
 */
async function requireOwnerOrAdmin() {
  const { supabase, user } = await requireUser()
  const activeOrg = await getActiveOrg(supabase, user.id)
  if (!activeOrg) redirect('/admin')
  if (!['owner', 'admin'].includes(activeOrg.role)) {
    return { supabase, user, activeOrg, authorized: false as const }
  }
  return { supabase, user, activeOrg, authorized: true as const }
}

/**
 * Updates the organisation name.
 */
export async function updateOrganisation(input: {
  orgId: string
  name: string
}): Promise<ActionResult> {
  const { supabase, authorized } = await requireOwnerOrAdmin()
  if (!authorized) return { success: false, error: 'Only owners and admins can update organisation settings.' }

  const name = input.name.trim()
  if (!name) return { success: false, error: 'Organisation name is required.' }

  const { error } = await supabase
    .from('organisations')
    .update({ name })
    .eq('id', input.orgId)

  if (error) {
    Sentry.captureException(error, { tags: { action: 'updateOrganisation.update' } })
    return { success: false, error: 'Could not update the organisation. Please retry.' }
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
 * Updates the organisation branding. Owner/admin only.
 * Stores null when all fields are cleared.
 */
export async function updateOrgBranding(input: {
  orgId: string
  branding: OrgBranding
}): Promise<ActionResult> {
  const { supabase, authorized } = await requireOwnerOrAdmin()
  if (!authorized) return { success: false, error: 'Only owners and admins can update branding.' }

  const { primaryColor, logoUrl, headerText } = input.branding

  if (primaryColor && !HEX_RE.test(primaryColor)) {
    return { success: false, error: 'Primary colour must be a valid hex value (e.g. #ff0000 or #f00).' }
  }

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
    .eq('id', input.orgId)

  if (error) {
    Sentry.captureException(error, { tags: { action: 'updateOrgBranding.update' } })
    return { success: false, error: 'Could not save branding. Please retry.' }
  }

  revalidatePath('/admin')
  return { success: true, data: undefined }
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/**
 * Lists members of the active org. Owner/admin only.
 */
export async function listOrgMembers(orgId: string): Promise<ActionResult<Array<{
  id: string
  user_id: string
  role: string
  email: string
  created_at: string
}>>> {
  const { supabase, authorized } = await requireOwnerOrAdmin()
  if (!authorized) return { success: false, error: 'Only owners and admins can view members.' }

  // Use admin client so the users join returns emails for all members,
  // not just the current user (users_select_own RLS blocks cross-user reads)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('org_members')
    .select('id, user_id, role, created_at, users!org_members_user_id_fkey(email)')
    .eq('org_id', orgId)
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
  orgId: string
  newRole: 'owner' | 'admin' | 'editor' | 'viewer'
}): Promise<ActionResult> {
  const { supabase, authorized } = await requireOwnerOrAdmin()
  if (!authorized) return { success: false, error: 'Only owners and admins can change roles.' }

  // Fetch the member being changed
  const { data: member } = await supabase
    .from('org_members')
    .select('id, user_id, role')
    .eq('id', input.memberId)
    .eq('org_id', input.orgId)
    .single()

  if (!member) return { success: false, error: 'Member not found.' }

  // Prevent demoting last owner
  if (member.role === 'owner' && input.newRole !== 'owner') {
    const { count } = await supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', input.orgId)
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

  revalidatePath('/admin')
  return { success: true, data: undefined }
}

/**
 * Removes a member from the org. Cannot remove last owner.
 */
export async function removeMember(input: {
  memberId: string
  orgId: string
}): Promise<ActionResult> {
  const { supabase, authorized } = await requireOwnerOrAdmin()
  if (!authorized) return { success: false, error: 'Only owners and admins can remove members.' }

  // Fetch the member being removed
  const { data: member } = await supabase
    .from('org_members')
    .select('id, role')
    .eq('id', input.memberId)
    .eq('org_id', input.orgId)
    .single()

  if (!member) return { success: false, error: 'Member not found.' }

  // Prevent removing last owner
  if (member.role === 'owner') {
    const { count } = await supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', input.orgId)
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

  revalidatePath('/admin')
  return { success: true, data: undefined }
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

/**
 * Lists pending invites for the org.
 */
export async function listOrgInvites(orgId: string): Promise<ActionResult<Array<{
  id: string
  email: string
  role: string
  created_at: string
}>>> {
  const { supabase, authorized } = await requireOwnerOrAdmin()
  if (!authorized) return { success: false, error: 'Only owners and admins can view invites.' }

  const { data, error } = await supabase
    .from('org_invites')
    .select('id, email, role, created_at')
    .eq('org_id', orgId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    Sentry.captureException(error, { tags: { action: 'listOrgInvites.select' } })
    return { success: false, error: 'Could not load pending invites. Please retry.' }
  }
  return { success: true, data: data ?? [] }
}

/**
 * Invites a user by email to the org. Sends invite email via Resend.
 * Uses the admin client for all DB writes to avoid RLS ambiguity on new tables.
 */
export async function inviteMember(input: {
  orgId: string
  email: string
  role: 'admin' | 'editor' | 'viewer'
}): Promise<ActionResult> {
  try {
    const { supabase, user, authorized } = await requireOwnerOrAdmin()
    if (!authorized) return { success: false, error: 'Only owners and admins can invite members.' }

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
        .eq('org_id', input.orgId)
        .eq('user_id', existingUser.id)
        .maybeSingle()

      if (existingMember) {
        return { success: false, error: 'This user is already a member of the organisation.' }
      }
    }

    // Insert invite via admin client — bypasses RLS so RETURNING always works
    const { data: invite, error: insertError } = await admin
      .from('org_invites')
      .insert({
        org_id: input.orgId,
        email,
        role: input.role,
        invited_by: user.id,
      })
      .select('token')
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

    // Fetch org name for the email (use user client — RLS allows member read)
    const { data: org } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', input.orgId)
      .maybeSingle()

    // Send invite email — failure never blocks invite creation
    const resend = getResendClient()
    if (resend && org) {
      const acceptUrl = `${getServerAppUrl()}/invites/${invite.token}`

      try {
        await resend.emails.send({
          from: getFromAddress(),
          to: email,
          subject: orgInviteSubject(org.name),
          html: orgInviteHtml({
            orgName: org.name,
            inviterEmail: user.email ?? 'unknown',
            role: input.role,
            acceptUrl,
          }),
          text: orgInviteText({
            orgName: org.name,
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
  orgId: string
}): Promise<ActionResult> {
  const { supabase, authorized } = await requireOwnerOrAdmin()
  if (!authorized) return { success: false, error: 'Only owners and admins can revoke invites.' }

  const { error } = await supabase
    .from('org_invites')
    .delete()
    .eq('id', input.inviteId)
    .eq('org_id', input.orgId)

  if (error) {
    Sentry.captureException(error, { tags: { action: 'revokeInvite.delete' } })
    return { success: false, error: 'Could not revoke this invite. Please retry.' }
  }

  revalidatePath('/admin')
  return { success: true, data: undefined }
}

/**
 * Accepts an invite by token. Uses service-role client for insert.
 * Validates: token exists, not already accepted, email matches user.
 */
export async function acceptInvite(token: string): Promise<ActionResult<{ orgId: string; role: string }>> {
  const { user } = await requireUser()

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

    return { success: true, data: { orgId: invite.org_id, role: invite.role } }
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
    return { success: false, error: 'Could not add you to the organisation. Please try again.' }
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
      error: 'You have been added to the organisation, but the invite could not be marked as accepted. Please refresh and try again.',
    }
  }

  // Set active org to the one they just joined
  setActiveOrgId(invite.org_id)

  return { success: true, data: { orgId: invite.org_id, role: invite.role } }
}
