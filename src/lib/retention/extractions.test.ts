import { describe, it, expect } from 'vitest'
import { runExtractionRetention } from './extractions'

type Row = { id: string; source_path: string | null; created_at: string }

interface FakeAdminOptions {
  rows: Row[]
  storageRemoveError?: string | null
  missingPaths?: Set<string>
}

function makeFakeAdmin(opts: FakeAdminOptions) {
  let remaining = [...opts.rows]
  const storageRemoved: string[] = []
  const dbDeleted: string[] = []

  const from = (table: string) => {
    if (table !== 'ai_extraction_log') throw new Error(`unexpected table: ${table}`)
    return {
      select: (_cols: string) => ({
        lt: (_col: string, cutoffIso: string) => ({
          limit: (n: number) =>
            Promise.resolve({
              data: remaining
                .filter((r) => r.created_at < cutoffIso)
                .slice(0, n)
                .map((r) => ({ id: r.id, source_path: r.source_path })),
              error: null,
            }),
        }),
      }),
      delete: () => ({
        in: (_col: string, ids: string[]) => {
          dbDeleted.push(...ids)
          remaining = remaining.filter((r) => !ids.includes(r.id))
          return Promise.resolve({ error: null })
        },
      }),
    }
  }

  const storage = {
    from: (_bucket: string) => ({
      remove: (paths: string[]) => {
        if (opts.storageRemoveError) {
          return Promise.resolve({ data: null, error: { message: opts.storageRemoveError } })
        }
        const removed = paths.filter((p) => !opts.missingPaths?.has(p))
        storageRemoved.push(...removed)
        return Promise.resolve({
          data: removed.map((name) => ({ name })),
          error: null,
        })
      },
    }),
  }

  return {
    admin: { from, storage } as any,
    storageRemoved,
    dbDeleted,
    get remaining() {
      return remaining
    },
  }
}

const NOW = new Date('2026-05-01T00:00:00.000Z')
const OLD = '2026-03-01T00:00:00.000Z' // > 30 days before NOW
const RECENT = '2026-04-28T00:00:00.000Z' // < 30 days before NOW

describe('runExtractionRetention', () => {
  it('is a no-op on empty state', async () => {
    const fake = makeFakeAdmin({ rows: [] })
    const result = await runExtractionRetention({ admin: fake.admin, now: NOW })
    expect(result).toEqual({ rowsDeleted: 0, objectsRemoved: 0, storageErrors: [] })
    expect(fake.storageRemoved).toEqual([])
    expect(fake.dbDeleted).toEqual([])
  })

  it('deletes old rows and their storage objects', async () => {
    const fake = makeFakeAdmin({
      rows: [
        { id: 'a', source_path: 'org/a/f.pdf', created_at: OLD },
        { id: 'b', source_path: 'org/b/f.pdf', created_at: OLD },
      ],
    })
    const result = await runExtractionRetention({ admin: fake.admin, now: NOW })
    expect(result.rowsDeleted).toBe(2)
    expect(result.objectsRemoved).toBe(2)
    expect(result.storageErrors).toEqual([])
    expect(fake.dbDeleted.sort()).toEqual(['a', 'b'])
    expect(fake.storageRemoved.sort()).toEqual(['org/a/f.pdf', 'org/b/f.pdf'])
  })

  it('does not touch rows younger than the cutoff', async () => {
    const fake = makeFakeAdmin({
      rows: [{ id: 'fresh', source_path: 'org/f.pdf', created_at: RECENT }],
    })
    const result = await runExtractionRetention({ admin: fake.admin, now: NOW })
    expect(result.rowsDeleted).toBe(0)
    expect(fake.dbDeleted).toEqual([])
  })

  it('deletes rows with null/empty source_path without calling storage', async () => {
    const fake = makeFakeAdmin({
      rows: [
        { id: 'n1', source_path: null, created_at: OLD },
        { id: 'n2', source_path: '   ', created_at: OLD },
      ],
    })
    const result = await runExtractionRetention({ admin: fake.admin, now: NOW })
    expect(result.rowsDeleted).toBe(2)
    expect(result.objectsRemoved).toBe(0)
    expect(fake.storageRemoved).toEqual([])
    expect(fake.dbDeleted.sort()).toEqual(['n1', 'n2'])
  })

  it('leaves DB rows intact when storage removal errors', async () => {
    const fake = makeFakeAdmin({
      rows: [{ id: 'x', source_path: 'org/x/f.pdf', created_at: OLD }],
      storageRemoveError: 'bucket unavailable',
    })
    const result = await runExtractionRetention({ admin: fake.admin, now: NOW })
    expect(result.rowsDeleted).toBe(0)
    expect(result.objectsRemoved).toBe(0)
    expect(result.storageErrors).toEqual(['bucket unavailable'])
    expect(fake.dbDeleted).toEqual([])
    expect(fake.remaining.map((r) => r.id)).toEqual(['x'])
  })

  it('is idempotent: second run is a no-op', async () => {
    const fake = makeFakeAdmin({
      rows: [{ id: 'a', source_path: 'org/a/f.pdf', created_at: OLD }],
    })
    await runExtractionRetention({ admin: fake.admin, now: NOW })
    const second = await runExtractionRetention({ admin: fake.admin, now: NOW })
    expect(second).toEqual({ rowsDeleted: 0, objectsRemoved: 0, storageErrors: [] })
  })
})
