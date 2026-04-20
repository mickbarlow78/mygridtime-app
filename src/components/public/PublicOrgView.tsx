/**
 * Presentational server component for the public organisation page.
 *
 * Receives a fully-resolved org, the org's published events, and the current
 * user (or null). The page route is responsible for the resolve step and the
 * `notFound()` decision — this component renders only.
 *
 * Used by `/[slug]/page.tsx` when the slug does not match an event but does
 * match an organisation.
 */

import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { signOut } from '@/app/admin/actions'
import { formatDate } from '@/lib/utils/slug'
import type { OrgBranding } from '@/lib/types/database'
import {
  PAGE_BG,
  HEADER,
  HEADER_INNER,
  CONTAINER_FULL,
  AUTH_EMAIL,
  AUTH_LINK,
} from '@/lib/styles'

export type PublicOrg = {
  id: string
  name: string
  slug: string
  branding: OrgBranding | null
}

export type PublicOrgEvent = {
  id: string
  title: string
  venue: string | null
  start_date: string
  end_date: string
  slug: string
}

interface Props {
  org: PublicOrg
  events: PublicOrgEvent[]
  user: User | null
}

export function PublicOrgView({ org, events, user }: Props) {
  const branding = org.branding ?? null
  const displayName = branding?.headerText ?? org.name

  return (
    <div className={PAGE_BG}>
      <header className={HEADER}>
        <div className={HEADER_INNER}>
          <div className="flex items-center gap-3 min-w-0">
            {branding?.logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={branding.logoUrl}
                alt={displayName}
                className="h-8 w-auto object-contain shrink-0"
              />
            )}
            <div className="min-w-0">
              <h1
                className="text-2xl font-semibold tracking-tight truncate"
                style={{ color: branding?.primaryColor ?? undefined }}
              >
                {displayName}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Published timetables from this organisation.
              </p>
            </div>
          </div>
          {user ? (
            <div className="flex items-center gap-4 shrink-0">
              <span className={AUTH_EMAIL}>{user.email}</span>
              <form action={signOut}>
                <button type="submit" className={AUTH_LINK}>
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link href="/auth/login" className={`shrink-0 ${AUTH_LINK}`}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      <div className={`${CONTAINER_FULL} py-6`}>
        {events.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No timetables have been published yet.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr
                  className="border-t border-b border-gray-200 text-left"
                  style={{ borderTopColor: branding?.primaryColor ?? undefined }}
                >
                  <th className="py-2.5 pr-6 pl-4 font-semibold text-gray-700 whitespace-nowrap">Event</th>
                  <th className="py-2.5 pr-6 font-semibold text-gray-700 whitespace-nowrap">Venue</th>
                  <th className="py-2.5 pr-6 font-semibold text-gray-700 whitespace-nowrap">Start</th>
                  <th className="py-2.5 pr-6 font-semibold text-gray-700 whitespace-nowrap">End</th>
                  <th className="py-2.5 pr-4 font-semibold text-gray-700 whitespace-nowrap sr-only">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {events.map((event) => {
                  const sameDay = event.start_date === event.end_date
                  return (
                    <tr key={event.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="py-3.5 pr-6 pl-4">
                        <Link
                          href={`/${org.slug}/${event.slug}`}
                          className="font-medium text-gray-900 group-hover:text-gray-600 hover:underline"
                        >
                          {event.title}
                        </Link>
                      </td>
                      <td className="py-3.5 pr-6 text-gray-500 whitespace-nowrap">
                        {event.venue ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3.5 pr-6 text-gray-500 whitespace-nowrap tabular-nums">
                        {formatDate(event.start_date)}
                      </td>
                      <td className="py-3.5 pr-6 text-gray-500 whitespace-nowrap tabular-nums">
                        {sameDay ? <span className="text-gray-300">—</span> : formatDate(event.end_date)}
                      </td>
                      <td className="py-3.5 pr-4 text-right">
                        <Link
                          href={`/${org.slug}/${event.slug}`}
                          className="text-gray-300 group-hover:text-gray-400 transition-colors"
                          aria-hidden="true"
                          tabIndex={-1}
                        >
                          →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
