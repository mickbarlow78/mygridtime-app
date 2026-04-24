'use client'

import { useState, useTransition } from 'react'
import { updateChampionshipBranding } from '@/app/admin/championships/actions'
import type { ChampionshipBranding } from '@/lib/types/database'
import { CARD, CARD_PADDING, LABEL, INPUT, HELP_TEXT, BTN_PRIMARY, ERROR_BANNER, SUCCESS_BANNER } from '@/lib/styles'
import { FIELD_LIMITS } from '@/lib/constants/field-limits'
import { CharCounter } from '@/components/ui/CharCounter'

interface BrandingFormProps {
  championshipId: string
  currentBranding: ChampionshipBranding | null
  onSaved?: () => void
}

const HEX_RE = /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/

/** Expand a valid 3-char hex to 6-char so <input type="color"> accepts it. */
function to6Hex(hex: string): string {
  const m = hex.trim().match(/^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/)
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`
  return hex.trim()
}

export function BrandingForm({ championshipId, currentBranding, onSaved }: BrandingFormProps) {
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
      const result = await updateChampionshipBranding({
        championshipId,
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
        onSaved?.()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className={`${CARD} ${CARD_PADDING} space-y-4`}>
      {/* Primary colour */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="branding-color" className={LABEL}>
            Primary colour
          </label>
          <CharCounter used={primaryColor.length} max={FIELD_LIMITS.org.primaryColor} />
        </div>
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
            maxLength={FIELD_LIMITS.org.primaryColor}
            className="w-32 text-sm px-3 py-2 border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>
        <p className={HELP_TEXT}>
          Accent colour for tabs and highlights. Leave empty for default.
        </p>
      </div>

      {/* Logo URL */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="branding-logo" className={LABEL}>
            Logo URL
          </label>
          <CharCounter used={logoUrl.length} max={FIELD_LIMITS.org.logoUrl} />
        </div>
        <input
          id="branding-logo"
          type="url"
          value={logoUrl}
          onChange={(e) => { setLogoUrl(e.target.value); setSuccess(false) }}
          placeholder="https://example.com/logo.png"
          maxLength={FIELD_LIMITS.org.logoUrl}
          className={INPUT}
        />
        <p className={HELP_TEXT}>
          Publicly accessible image URL. Displayed in the timetable page header.
        </p>
      </div>

      {/* Header text */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="branding-text" className={LABEL}>
            Header text
          </label>
          <CharCounter used={headerText.length} max={FIELD_LIMITS.org.headerText} />
        </div>
        <input
          id="branding-text"
          type="text"
          value={headerText}
          onChange={(e) => { setHeaderText(e.target.value); setSuccess(false) }}
          placeholder="e.g. MSUK Karting"
          maxLength={FIELD_LIMITS.org.headerText}
          className={INPUT}
        />
        <p className={HELP_TEXT}>
          Short label shown alongside the logo in the timetable header.
        </p>
      </div>

      {error && (
        <p className={ERROR_BANNER}>{error}</p>
      )}
      {success && (
        <p className={SUCCESS_BANNER}>Branding saved.</p>
      )}

      <div className="pt-1">
        <button
          type="submit"
          disabled={pending}
          className={BTN_PRIMARY}
        >
          {pending ? 'Saving…' : 'Save branding'}
        </button>
      </div>
    </form>
  )
}
