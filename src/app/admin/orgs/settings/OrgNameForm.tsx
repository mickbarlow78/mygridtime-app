'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateOrganisation } from '@/app/admin/orgs/actions'

interface OrgNameFormProps {
  orgId: string
  currentName: string
}

export function OrgNameForm({ orgId, currentName }: OrgNameFormProps) {
  const router = useRouter()
  const [name, setName] = useState(currentName)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!name.trim()) { setError('Name is required.'); return }
    if (name.trim() === currentName) return

    startTransition(async () => {
      const result = await updateOrganisation({ orgId, name: name.trim() })
      if (!result.success) {
        setError(result.error)
      } else {
        setSuccess(true)
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 px-4 py-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSuccess(false) }}
            required
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={pending || name.trim() === currentName}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          Save
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-600 mt-2">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-700 mt-2">Name updated.</p>
      )}
    </form>
  )
}
