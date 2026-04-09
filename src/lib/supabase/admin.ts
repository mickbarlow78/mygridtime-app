import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

/**
 * Creates a Supabase client with the service-role key.
 * Bypasses RLS — use only for privileged server-side operations
 * (e.g. inserting the initial owner into org_members on org creation).
 *
 * Never expose this client or the service-role key to the browser.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Admin Supabase client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}
