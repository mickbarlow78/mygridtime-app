'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { setActiveOrgId } from '@/lib/utils/active-org'

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

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from('organisations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (existing) return { success: false, error: 'That slug is already taken.' }

  // Insert organisation (RLS allows authenticated users to INSERT)
  const { data: org, error: orgError } = await supabase
    .from('organisations')
    .insert({ name, slug })
    .select('id')
    .single()

  if (orgError || !org) return { success: false, error: orgError?.message ?? 'Failed to create organisation.' }

  // Insert owner membership via admin client (bypasses RLS)
  const admin = createAdminClient()
  const { error: memberError } = await admin
    .from('org_members')
    .insert({ org_id: org.id, user_id: user.id, role: 'owner' })

  if (memberError) {
    // Clean up the org if membership insert fails
    await admin.from('organisations').delete().eq('id', org.id)
    return { success: false, error: memberError.message }
  }

  // Set active org cookie to the new org
  setActiveOrgId(org.id)

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
