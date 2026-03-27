// Phase 2: Magic link login form.
// Email input + "Send magic link" button.
// Calls supabase.auth.signInWithOtp({ email }).
// Shows confirmation message after submission.
export default function LoginPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-gray-500">Magic link login coming in Phase 2.</p>
    </div>
  )
}
