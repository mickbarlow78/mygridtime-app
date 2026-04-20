// MGT-081 — Shared retention helper for ai_extraction_log + event-extractions storage.
//
// Implemented as .mjs so it can be imported directly by both the Next.js
// route (via TS `moduleResolution: 'bundler'`) and the Node manual runner
// script — giving us a single source of truth with no fetch hop, no server
// dependency, and no duplicated logic. Types live in the sibling .d.ts.

const DB_BATCH = 1000
const STORAGE_CHUNK = 100
const BUCKET = 'event-extractions'

export async function runExtractionRetention({
  admin,
  olderThanDays = 30,
  now = new Date(),
}) {
  const cutoffIso = new Date(now.getTime() - olderThanDays * 86_400_000).toISOString()

  let rowsDeleted = 0
  let objectsRemoved = 0
  const storageErrors = []

  for (;;) {
    const { data: rows, error } = await admin
      .from('ai_extraction_log')
      .select('id, source_path')
      .lt('created_at', cutoffIso)
      .limit(DB_BATCH)

    if (error) {
      throw new Error(`Retention select failed: ${error.message}`)
    }

    const batch = rows ?? []
    if (batch.length === 0) break

    const idsEligibleForDelete = []
    const pathsToRemove = []
    const pathToIds = new Map()

    for (const row of batch) {
      const raw = typeof row.source_path === 'string' ? row.source_path.trim() : ''
      if (raw === '') {
        idsEligibleForDelete.push(row.id)
        continue
      }
      pathsToRemove.push(raw)
      const existing = pathToIds.get(raw)
      if (existing) existing.push(row.id)
      else pathToIds.set(raw, [row.id])
    }

    for (let i = 0; i < pathsToRemove.length; i += STORAGE_CHUNK) {
      const chunk = pathsToRemove.slice(i, i + STORAGE_CHUNK)
      const { data: removed, error: rmErr } = await admin.storage.from(BUCKET).remove(chunk)
      if (rmErr) {
        storageErrors.push(rmErr.message)
        continue
      }
      objectsRemoved += Array.isArray(removed) ? removed.length : 0
      for (const path of chunk) {
        const ids = pathToIds.get(path)
        if (ids) idsEligibleForDelete.push(...ids)
      }
    }

    if (idsEligibleForDelete.length === 0) break

    const { error: delErr } = await admin
      .from('ai_extraction_log')
      .delete()
      .in('id', idsEligibleForDelete)

    if (delErr) {
      throw new Error(`Retention delete failed: ${delErr.message}`)
    }
    rowsDeleted += idsEligibleForDelete.length

    if (batch.length < DB_BATCH) break
  }

  return { rowsDeleted, objectsRemoved, storageErrors }
}
