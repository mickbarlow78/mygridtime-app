'use client'

import type { TemplateSummary } from '@/app/admin/templates/actions'
import { cn } from '@/lib/styles'

interface TemplatePickerProps {
  templates: TemplateSummary[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function TemplatePicker({ templates, selectedId, onSelect }: TemplatePickerProps) {
  if (templates.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-3">
        No templates available. Save an event as a template first.
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      {templates.map((t) => {
        const isSelected = selectedId === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(isSelected ? null : t.id)}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-md border text-sm transition-colors',
              isSelected
                ? 'border-gray-900 bg-gray-50 ring-1 ring-gray-900'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
            )}
          >
            <span className="font-medium text-gray-900">{t.name}</span>
            <span className="text-gray-400 ml-2">
              {t.day_count} {t.day_count === 1 ? 'day' : 'days'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
