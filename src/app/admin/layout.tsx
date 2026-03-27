// Phase 2: Auth guard added here — unauthenticated users redirected to /auth/login.
// Phase 3: Persistent header with user email + logout added here.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div>{children}</div>
}
