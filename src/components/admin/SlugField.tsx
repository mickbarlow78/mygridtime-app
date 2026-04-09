'use client'

import { useState } from 'react'

interface SlugFieldProps {
  publicUrl: string
}

export function SlugField({ publicUrl }: SlugFieldProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — silently ignore
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-mono text-gray-600 truncate">{publicUrl}</p>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2.5 py-1.5 hover:border-gray-300 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1">The slug cannot be changed after creation.</p>
    </div>
  )
}
