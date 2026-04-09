'use client'

import { useState, useTransition } from 'react'
import { updateOrgBranding } from '@/app/admin/orgs/actions'
import type { OrgBranding } from '@/lib/types/database'

interface BrandingFormProps {
  orgId: string
  currentBranding: OrgBranding | null
}

const HEX_RE = /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/

/** Expand a valid 3-char hex to 6-char so <input type="color"> accepts it. */
function to6Hex(hex: string): string {
  const m = hex.trim().match(/^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/)
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`
  return hex.trim()
}

export function BrandingForm({ orgId, currentBranding }: BrandingFormProps) {
  const [primaryColor, setPrimaryColor] = useState(currentBranding?.primaryColor ?? '')
  // pickerColor must always be a valid 6-char hex for the native color input
  const [pickerColor, setPickerColor] = useState<string>(() => {
    const v = currentBranding?.primaryColor ?? ''
    return HEX_RE.test(v) ? to6Hex(v) : '#000000'
  })
  const [logoUrl, setLogoUrl] = useState(currentBranding?.logoUrl ?? '')
  const [headerText, setHeaderText] = useState(currentBranding?.headerText ?? '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    // Client-side hex validation (non-empty values only)
    if (primaryColor.trim() && !HEX_RE.test(primaryColor.trim())) {
      setError('Primary colour must be a valid hex value (e.g. #ff0000 or #f00).')
      return
    }

    startTransition(async () => {
      const result = await updateOrgBranding({
        orgId,
        branding: {
          primaryColor: primaryColor.trim() || null,
          logoUrl: logoUrl.trim() || null,
          headerText: headerText.trim() || null,
        },
      })

      if (!result.success) {
        setError(result.error)
      } else {
        setSuccess(true)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 px-6 py-5 space-y-4">
      {/* Primary colour */}
      <div>
        <label htmlFor="branding-color" className="block text-sm font-medium text-gray-700 mb-1.5">
          Primary colour
        </label>
        <div className="flex items-center gap-2">
          {/* Native colour picker — always 6-char hex; drives the text field */}
          <input
            type="color"
            value={pickerColor}
            onChange={(e) => {
              setPickerColor(e.target.value)
              setPrimaryColor(e.target.value)
              setSuccess(false)
            }}
            className="w-9 h-9 rounded border border-gray-300 cursor-pointer p-0.5 shrink-0"
            aria-label="Pick a colour"
          />
          {/* Editable hex text field — drives the picker when valid */}
          <input
            id="branding-color"
            type="text"
            value={primaryColor}
            onChange={(e) => {
              const v = e.target.value
              setPrimaryColor(v)
              setSuccess(false)
              if (HEX_RE.test(v.trim())) setPickerColor(to6Hex(v.trim()))
            }}
            placeholder="#000000"
            className="w-32 text-sm px-3 py-2 border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Accent colour for tabs and highlights. Leave empty for default.
        </p>
      </div>

      {/* Logo URL */}
      <div>
        <label htmlFor="branding-logo" className="block text-sm font-medium text-gray-700 mb-1.5">
          Logo URL
        </label>
        <input
          id="branding-logo"
          type="url"
          value={logoUrl}
          onChange={(e) => { setLogoUrl(e.target.value); setSuccess(false) }}
          placeholder="https://example.com/logo.png"
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">
          Publicly accessible image URL. Displayed in the timetable page header.
        </p>
      </div>

      {/* Header text */}
      <div>
        <label htmlFor="branding-text" className="block text-sm font-medium text-gray-700 mb-1.5">
          Header text
        </label>
        <input
          id="branding-text"
          type="text"
          value={headerText}
          onChange={(e) => { setHeaderText(e.target.value); setSuccess(false) }}
          placeholder="e.g. MSUK Karting"
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">
          Short label shown alongside the logo in the timetable header.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Branding saved.
        </p>
      )}

      <div className="pt-1">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {pending ? 'Saving…' : 'Save branding'}
        </button>
      </div>
    </form>
  )
}
