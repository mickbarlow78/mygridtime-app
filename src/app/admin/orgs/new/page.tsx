'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createOrganisation } from '../actions'

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
    const result = await createOrganisation({ name, slug })
    if (!result.success) {
      setError(result.error)
      setSubmitting(false)
      return
    }
    router.push('/admin')
  }

  return (
    <div className="max-w-lg space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin" className="hover:text-gray-800 transition-colors">Events</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-800">New organisation</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Create organisation</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          You will be the owner of this organisation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 px-6 py-5 space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 mb-1.5">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="org-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. MSUK Karting"
            required
            autoFocus
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        {/* Slug */}
        <div>
          <label htmlFor="org-slug" className="block text-sm font-medium text-gray-700 mb-1.5">
            Slug <span className="text-red-500">*</span>
          </label>
          <input
            id="org-slug"
            type="text"
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugTouched(true) }}
            placeholder="e.g. msuk-karting"
            required
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            URL-safe identifier. Lowercase letters, numbers, and hyphens only.
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {submitting ? 'Creating…' : 'Create organisation'}
          </button>
          <Link
            href="/admin"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
