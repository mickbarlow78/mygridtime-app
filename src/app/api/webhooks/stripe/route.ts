// Phase 7c: Stripe webhook handler.
// Handles subscription lifecycle events (checkout.session.completed,
// customer.subscription.updated, customer.subscription.deleted).
// Updates subscription_status in public_users table via Supabase service role client.
export async function POST() {
  // Not implemented until Phase 7c
  return new Response('Not implemented', { status: 501 })
}
