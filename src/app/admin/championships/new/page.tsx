'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createChampionship } from '../actions'
import { CONTAINER_NARROW, BREADCRUMB, BREADCRUMB_LINK, BREADCRUMB_SEP, BREADCRUMB_CURRENT, H1, SUBTITLE, CARD, CARD_PADDING, LABEL, INPUT, HELP_TEXT, BTN_PRIMARY, BTN_GHOST, ERROR_BANNER } from '@/lib/styles'
import { FIELD_LIMITS } from '@/lib/constants/field-limits'
import { CharCounter } from '@/components/ui/CharCounter'

export default function NewOrgPage() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Auto-generate slug from name unless user has manually edited it. */
  function handleNameChange(value: string) {
    setName(value)
    if (!slugTouched) {
      setSlug(
        value
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/[\s]+/g, '-')
          .replace(/-{2,}/g, '-')
          .replace(/^-+|-+$/g, '')
      )
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) { setError('Name is required.'); return }
    if (!slug.trim()) { setError('Slug is required.'); return }

    setSubmitting(true)
    const result = await createChampionship({ name, slug })
    if (!result.success) {
      setError(result.error)
      setSubmitting(false)
      return
    }
    // First-run onboarding: route new owners to settings so they can set up
    // branding before creating events. Subsequent creates keep the existing
    // /admin destination.
    router.push(result.data.isFirstChampionship ? '/admin/championships/settings' : '/admin')
  }

  return (
    <div className={`${CONTAINER_NARROW} space-y-6`}>
      {/* Breadcrumb */}
      <div className={BREADCRUMB}>
        <Link href="/admin" className={BREADCRUMB_LINK}>Timetables</Link>
        <span className={BREADCRUMB_SEP}>/</span>
        <span className={BREADCRUMB_CURRENT}>New championship</span>
      </div>

      <div>
        <h1 className={H1}>Create championship</h1>
        <p className={SUBTITLE}>
          You will be the owner of this championship.
        </p>
      </div>

      <form onSubmit={handleSubmit} className={`${CARD} ${CARD_PADDING} space-y-4`}>
        {/* Name */}
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="org-name" className={LABEL}>
              Name <span className="text-red-500">*</span>
            </label>
            <CharCounter used={name.length} max={FIELD_LIMITS.org.name} />
          </div>
          <input
            id="org-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. MSUK Karting"
            required
            autoFocus
            maxLength={FIELD_LIMITS.org.name}
            className={INPUT}
          />
        </div>

        {/* Slug */}
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="org-slug" className={LABEL}>
              Slug <span className="text-red-500">*</span>
            </label>
            <CharCounter used={slug.length} max={FIELD_LIMITS.org.slug} />
          </div>
          <input
            id="org-slug"
            type="text"
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugTouched(true) }}
            placeholder="e.g. msuk-karting"
            required
            maxLength={FIELD_LIMITS.org.slug}
            className={`${INPUT} font-mono`}
          />
          <p className={HELP_TEXT}>
            URL-safe identifier. Lowercase letters, numbers, and hyphens only.
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className={ERROR_BANNER}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className={BTN_PRIMARY}
          >
            {submitting ? 'Creating…' : 'Create championship'}
          </button>
          <Link
            href="/admin"
            className={BTN_GHOST}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
