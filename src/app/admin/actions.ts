'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Signs the current user out and redirects to /auth/login.
 * Called via a form action in the admin layout header.
 */
export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}
