import type { EventStatus } from '@/lib/types/database'

const styles: Record<EventStatus, string> = {
  draft:     'bg-yellow-50 text-yellow-700 border border-yellow-200',
  published: 'bg-green-50 text-green-700 border border-green-200',
  archived:  'bg-gray-100 text-gray-500 border border-gray-200',
}

const labels: Record<EventStatus, string> = {
  draft:     'Draft',
  published: 'Published',
  archived:  'Archived',
}

export function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}
