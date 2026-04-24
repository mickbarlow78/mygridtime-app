'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { switchChampionship } from '@/app/admin/championships/actions'

interface ChampionshipOption {
  org_id: string
  org_name: string
}

interface ChampionshipSelectorProps {
  championships: ChampionshipOption[]
  activeChampionshipId: string
}

/**
 * Championship switcher dropdown — only rendered when the user belongs to 2+ championships.
 * Calls switchChampionship() server action on change, then refreshes to reload data.
 */
export function ChampionshipSelector({ championships, activeChampionshipId }: ChampionshipSelectorProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const championshipId = e.target.value
    if (championshipId === activeChampionshipId) return
    startTransition(async () => {
      await switchChampionship(championshipId)
      router.refresh()
    })
  }

  return (
    <select
      value={activeChampionshipId}
      onChange={handleChange}
      disabled={pending}
      className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-2 sm:py-1 min-h-[40px] sm:min-h-0 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50 max-w-[160px] truncate"
    >
      {championships.map((championship) => (
        <option key={championship.org_id} value={championship.org_id}>
          {championship.org_name}
        </option>
      ))}
    </select>
  )
}
