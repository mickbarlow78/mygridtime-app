'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateOrganisation } from '@/app/admin/orgs/actions'
import { CARD, CARD_PADDING_COMPACT, INPUT, BTN_PRIMARY, ERROR_BANNER, SUCCESS_BANNER } from '@/lib/styles'
import { FIELD_LIMITS } from '@/lib/constants/field-limits'
import { CharCounter } from '@/components/ui/CharCounter'

interface OrgNameFormProps {
  orgId: string
  currentName: string
  onSaved?: () => void
}

export function OrgNameForm({ orgId, currentName, onSaved }: OrgNameFormProps) {
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
        onSaved?.()
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className={`${CARD} ${CARD_PADDING_COMPACT}`}>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-end mb-1">
            <CharCounter used={name.length} max={FIELD_LIMITS.org.name} />
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSuccess(false) }}
            required
            maxLength={FIELD_LIMITS.org.name}
            className={INPUT}
          />
        </div>
        <button
          type="submit"
          disabled={pending || name.trim() === currentName}
          className={BTN_PRIMARY}
        >
          Save
        </button>
      </div>
      {error && (
        <p className={`${ERROR_BANNER} mt-2`}>{error}</p>
      )}
      {success && (
        <p className={`${SUCCESS_BANNER} mt-2`}>Name updated.</p>
      )}
    </form>
  )
}
