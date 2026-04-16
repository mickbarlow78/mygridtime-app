import Link from 'next/link'
import { listTemplates } from './actions'
import { formatDate } from '@/lib/utils/slug'
import { TemplateActions } from './TemplateActions'
import { H1, SUBTITLE, BREADCRUMB, BREADCRUMB_LINK, BREADCRUMB_SEP, BREADCRUMB_CURRENT, LIST_CARD, ERROR_BANNER } from '@/lib/styles'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  const result = await listTemplates()
  const templates = result.success ? result.data : []
  const loadError = result.success ? null : result.error

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className={BREADCRUMB}>
        <Link href="/admin" className={BREADCRUMB_LINK}>Events</Link>
        <span className={BREADCRUMB_SEP}>/</span>
        <span className={BREADCRUMB_CURRENT}>Templates</span>
      </div>

      <div>
        <h1 className={H1}>Templates</h1>
        <p className={SUBTITLE}>Reusable event structures. Use a template when creating a new event.</p>
      </div>

      {loadError && (
        <div className={ERROR_BANNER} role="alert">{loadError}</div>
      )}

      {templates.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-base mb-2">No templates yet.</p>
          <p className="text-sm">
            Open an event in the editor and use &ldquo;Save as template&rdquo; to create one.
          </p>
        </div>
      ) : (
        <TemplateActions templates={templates} />
      )}
    </div>
  )
}
