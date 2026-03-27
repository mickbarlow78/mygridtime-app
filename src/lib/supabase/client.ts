import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'

/**
 * Creates a Supabase client for use in Client Components.
 * Uses the public anon key — subject to Row Level Security policies.
 *
 * Only call this from components that require Supabase (Phase 2+).
 * Will throw a clear error if env vars are not configured.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured.\n' +
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment (Phase 2).'
    )
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
}
