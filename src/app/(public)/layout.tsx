/**
 * Public route group layout.
 *
 * Intentionally minimal — this group covers the visitor-facing timetable pages
 * and has no admin chrome. Each page handles its own full-page structure.
 *
 * The root layout (app/layout.tsx) already provides <html> and <body>.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
