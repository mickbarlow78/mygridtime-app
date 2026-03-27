import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from './actions'

/**
 * Admin layout — Server Component.
 *
 * Auth guard: checks for a valid Supabase session on every render.
 * Unauthenticated users are redirected to /auth/login.
 * (Middleware also enforces this — this is a defence-in-depth check.)
 *
 * Renders a minimal persistent header with the user's email and a sign-out button.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Persistent admin header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900 tracking-tight">
            MyGridTime
          </span>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400 hidden sm:block">
              {user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
