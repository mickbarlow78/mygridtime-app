'use client'

import { useState } from 'react'
import { HELP_TEXT } from '@/lib/styles'

interface PublicOrgUrlFieldProps {
  publicUrl: string
}

/**
 * Read-only display of the public organisation URL (`/{slug}`) with a Copy
 * button. Mirrors the per-event "Public URL" affordance in `EventEditor` so
 * the clipboard interaction stays consistent across surfaces.
 */
export function PublicOrgUrlField({ publicUrl }: PublicOrgUrlFieldProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (insecure context / permission) — silently ignore;
      // the URL remains visible in the input for manual copy.
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2 max-w-xl">
        <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">Public URL</span>
        <input
          type="text"
          readOnly
          value={publicUrl}
          className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded bg-gray-50 text-gray-400 font-mono focus:outline-none truncate"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2.5 py-1 hover:border-gray-300 transition-colors whitespace-nowrap"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className={HELP_TEXT}>
        Lists only this organisation&rsquo;s published events. Per-event URLs remain at <code className="font-mono">/{'{event-slug}'}</code>.
      </p>
    </div>
  )
}
