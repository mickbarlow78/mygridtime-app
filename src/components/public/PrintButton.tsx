'use client'

/**
 * Triggers the browser's native print dialog.
 * Must be a Client Component because it calls window.print().
 */
export function PrintButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      Print / Save as PDF
    </button>
  )
}
