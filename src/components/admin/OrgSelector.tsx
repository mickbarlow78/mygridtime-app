'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { switchOrg } from '@/app/admin/orgs/actions'

interface OrgOption {
  org_id: string
  org_name: string
}

interface OrgSelectorProps {
  orgs: OrgOption[]
  activeOrgId: string
}

/**
 * Org switcher dropdown — only rendered when the user belongs to 2+ orgs.
 * Calls switchOrg() server action on change, then refreshes to reload data.
 */
export function OrgSelector({ orgs, activeOrgId }: OrgSelectorProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const orgId = e.target.value
    if (orgId === activeOrgId) return
    startTransition(async () => {
      await switchOrg(orgId)
      router.refresh()
    })
  }

  return (
    <select
      value={activeOrgId}
      onChange={handleChange}
      disabled={pending}
      className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50 max-w-[160px] truncate"
    >
      {orgs.map((org) => (
        <option key={org.org_id} value={org.org_id}>
          {org.org_name}
        </option>
      ))}
    </select>
  )
}
