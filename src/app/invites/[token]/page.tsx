import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AcceptInviteForm } from './AcceptInviteForm'

/**
 * Invite accept page — Server Component.
 *
 * Checks auth upfront. If unauthenticated, redirects to /auth/login with
 * ?next= set to this invite URL so the full auth flow returns here.
 * Renders the interactive AcceptInviteForm for authenticated users.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: { token: string }
}) {
  const { token } = params

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Redirect to login preserving the invite URL as the return path.
    // sendMagicLink will store this in a cookie; the auth callback reads it.
    redirect(`/auth/login?next=${encodeURIComponent(`/invites/${token}`)}`)
  }

  return <AcceptInviteForm token={token} />
}
