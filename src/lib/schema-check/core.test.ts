import { describe, it, expect } from 'vitest'
import {
  classifyProbe,
  extractTableRefs,
  extractEmbedRefs,
  normaliseAllowlist,
  isTableAllowed,
  isEmbedAllowed,
  staleAllowlistEntries,
  formatPassBanner,
  formatSkipBanner,
  SENTINEL_TABLE,
} from './core'

// ---------------------------------------------------------------------------
// Fixtures below are VERBATIM responses captured from the live production
// Supabase project (hxxderwxxpfzdxlmsqpl) on 2026-08-21 while building this
// gate. They are the ground truth for every assumption the gate rests on.
// Do not "tidy" them — if PostgREST ever changes these shapes, these tests
// should be what tells us.
// ---------------------------------------------------------------------------

const JSON_CT = 'application/json; charset=utf-8'

/** tsconfig target predates downlevelIteration, so avoid spreading Map iterators. */
function keysOf(map: Map<string, unknown>): string[] {
  const out: string[] = []
  map.forEach((_value, key) => out.push(key))
  return out
}

/** GET /rest/v1/organisations?select=*&limit=0 — anon key AND service key, HTTP 404. */
const LIVE_PGRST205_ORGANISATIONS =
  '{"code":"PGRST205","details":null,"hint":"Perhaps you meant the table \'public.notification_log\'","message":"Could not find the table \'public.organisations\' in the schema cache"}'

/** GET /rest/v1/events?select=slug,organisations!inner(slug)&limit=0 — HTTP 400. */
const LIVE_PGRST200_EMBED =
  '{"code":"PGRST200","details":"Searched for a foreign key relationship between \'events\' and \'organisations\' in the schema \'public\', but no matches were found.","hint":"Perhaps you meant \'notification_log\' instead of \'organisations\'.","message":"Could not find a relationship between \'events\' and \'organisations\' in the schema cache"}'

describe('classifyProbe — the negative test (DEC-045 / MGT-109)', () => {
  // THIS IS THE TEST THAT MATTERS. A gate nobody has seen fail is not known to
  // work. If this assertion ever stops holding, the gate silently becomes a
  // no-op that always passes.
  it('classifies the removed `organisations` table as a FAILURE, not a pass', () => {
    const result = classifyProbe({
      status: 404,
      contentType: JSON_CT,
      body: LIVE_PGRST205_ORGANISATIONS,
    })

    expect(result.kind).toBe('missing-table')
    expect(result.code).toBe('PGRST205')
    expect(result.message).toContain("Could not find the table 'public.organisations'")
  })

  it('classifies the MGT-109 relationship embed as a FAILURE', () => {
    const result = classifyProbe({
      status: 400,
      contentType: JSON_CT,
      body: LIVE_PGRST200_EMBED,
    })

    expect(result.kind).toBe('missing-relationship')
    expect(result.code).toBe('PGRST200')
  })

  it('names the sentinel as the table the rename removed', () => {
    expect(SENTINEL_TABLE).toBe('organisations')
  })
})

describe('classifyProbe — the assumptions that would sink the design', () => {
  // Verified live: PostgREST resolves the schema cache BEFORE permissions, so a
  // missing table returns PGRST205 (404) under the anon key, not 401/403. If
  // that were not true, a missing table would be indistinguishable from a
  // permission denial and the whole approach would be unsound.
  it('treats permission denial as OK — the table exists, we just cannot read it', () => {
    for (const status of [401, 403]) {
      const result = classifyProbe({
        status,
        contentType: JSON_CT,
        body: '{"message":"permission denied for table championships"}',
      })
      expect(result.kind).toBe('ok')
    }
  })

  it('treats a healthy empty result as OK', () => {
    expect(classifyProbe({ status: 200, contentType: JSON_CT, body: '[]' }).kind).toBe('ok')
  })

  // The live JAVASCRIPT-NEXTJS-6 condition: Cloudflare returns an HTML block
  // page for supabase.co. This MUST land in the loud-skip branch, never in a
  // pass and never in a fail.
  it('treats a Cloudflare WAF HTML block page as unverifiable, not as a pass', () => {
    const result = classifyProbe({
      status: 403,
      contentType: 'text/html; charset=UTF-8',
      body: '<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body>Sorry, you have been blocked</body></html>',
    })

    expect(result.kind).toBe('unverifiable')
    expect(result.reason).toContain('non-JSON')
  })

  it('treats a network failure as unverifiable', () => {
    expect(classifyProbe({ status: 0, contentType: '', body: '' }).kind).toBe('unverifiable')
  })

  it('treats an upstream 5xx as unverifiable', () => {
    expect(classifyProbe({ status: 502, contentType: JSON_CT, body: '{"message":"bad gateway"}' }).kind).toBe(
      'unverifiable'
    )
  })

  it('does not fail on PostgREST codes outside the two-code fail surface', () => {
    const result = classifyProbe({
      status: 400,
      contentType: JSON_CT,
      body: '{"code":"42703","message":"column events.nope does not exist"}',
    })
    expect(result.kind).toBe('unexpected')
  })
})

describe('extractTableRefs', () => {
  it('finds string-literal Supabase table references', () => {
    const files = [
      {
        path: 'a.ts',
        source: `const { data } = await supabase.from('events').select('id')\nawait admin.from("championship_members").select('*')`,
      },
    ]
    const { tables } = extractTableRefs(files)
    expect(keysOf(tables).sort()).toEqual(['championship_members', 'events'])
    expect(tables.get('events')?.[0]).toEqual({ path: 'a.ts', line: 1 })
  })

  // All 13 non-literal `.from(` sites in this codebase today are one of these
  // three. Excluding by receiver rather than by a name blocklist means a new
  // Array.from never becomes a false positive.
  it('excludes Array.from, Buffer.from and storage.from', () => {
    const files = [
      {
        path: 'b.ts',
        source: [
          `const ids = Array.from(new Set(rows.map((r) => r.id)))`,
          `const bytes = Buffer.from(await file.arrayBuffer())`,
          `await admin.storage\n  .from('event-extractions')\n  .upload(path, bytes)`,
        ].join('\n'),
      },
    ]
    const { tables, dynamic } = extractTableRefs(files)
    expect(keysOf(tables)).toEqual([])
    expect(dynamic).toEqual([])
  })

  it('records a dynamic table name so it cannot appear silently', () => {
    const files = [{ path: 'c.ts', source: `await supabase.from(tableName).select('*')` }]
    const { tables, dynamic } = extractTableRefs(files)
    expect(keysOf(tables)).toEqual([])
    expect(dynamic).toHaveLength(1)
    expect(dynamic[0]).toEqual({ path: 'c.ts', line: 1 })
  })
})

describe('extractEmbedRefs — all three embed syntaxes in this codebase', () => {
  // A design that only scans .from() would have caught PGRST205 and shipped
  // PGRST200. Each of these three shapes is present in the real codebase.
  it('captures !inner, alias and FK-hint embed forms', () => {
    const files = [
      {
        path: 'p.ts',
        source: `await supabase.from('events').select('slug, championships!inner(slug)')`,
      },
      {
        path: 'q.ts',
        source: `await supabase.from('audit_log').select('*, users:user_id ( email )')`,
      },
      {
        path: 'r.ts',
        source: `await supabase\n  .from('championship_members')\n  .select('id, role, users!championship_members_user_id_fkey(email)')`,
      },
    ]

    const embeds = extractEmbedRefs(files)
    expect(embeds.map((e) => e.table).sort()).toEqual(['audit_log', 'championship_members', 'events'])
    expect(embeds.find((e) => e.table === 'events')?.select).toBe('slug, championships!inner(slug)')
    expect(embeds.find((e) => e.table === 'audit_log')?.select).toBe('*, users:user_id ( email )')
  })

  it('ignores select strings with no embed', () => {
    const files = [{ path: 's.ts', source: `await supabase.from('events').select('id, title')` }]
    expect(extractEmbedRefs(files)).toEqual([])
  })

  it('does not attribute a select to a different chain', () => {
    const files = [
      {
        path: 't.ts',
        source: `await supabase.from('events').eq('id', id)\nawait supabase.from('users').select('*, teams(name)')`,
      },
    ]
    const embeds = extractEmbedRefs(files)
    expect(embeds).toHaveLength(1)
    expect(embeds[0].table).toBe('users')
  })

  it('deduplicates identical query shapes', () => {
    const src = `await supabase.from('events').select('slug, championships!inner(slug)')`
    const embeds = extractEmbedRefs([
      { path: 'x.ts', source: src },
      { path: 'y.ts', source: src },
    ])
    expect(embeds).toHaveLength(1)
  })
})

describe('allowlist', () => {
  it('defaults a missing file to an empty allowlist with a zero dynamic baseline', () => {
    const a = normaliseAllowlist(null)
    expect(a.tables).toEqual([])
    expect(a.embeds).toEqual([])
    expect(a.dynamicFromBaseline).toBe(0)
  })

  it('suppresses an allowlisted table and embed', () => {
    const a = normaliseAllowlist({
      tables: [{ name: 'legacy_thing', reason: 'created outside migrations' }],
      embeds: [{ from: 'events', select: 'id, foo(bar)', reason: 'view-backed' }],
    })
    expect(isTableAllowed(a, 'legacy_thing')).toBe(true)
    expect(isTableAllowed(a, 'events')).toBe(false)
    expect(isEmbedAllowed(a, 'events', 'id, foo(bar)')).toBe(true)
    expect(isEmbedAllowed(a, 'events', 'id, other(bar)')).toBe(false)
  })

  it('reports allowlist entries that no longer suppress anything', () => {
    const a = normaliseAllowlist({
      tables: [
        { name: 'still_broken', reason: 'r1' },
        { name: 'fixed_since', reason: 'r2' },
      ],
      embeds: [],
    })
    const stale = staleAllowlistEntries(a, { tables: ['still_broken'], embeds: [] })
    expect(stale).toHaveLength(1)
    expect(stale[0]).toContain('fixed_since')
  })
})

describe('banners', () => {
  it('states how many things a pass actually verified', () => {
    const banner = formatPassBanner({
      host: 'example.supabase.co',
      tableCount: 13,
      embedCount: 8,
      elapsedMs: 812,
    })
    expect(banner).toContain('SCHEMA CHECK PASSED')
    expect(banner).toContain('Tables probed : 13')
    expect(banner).toContain('Embeds probed : 8')
    expect(banner).toContain(SENTINEL_TABLE)
  })

  it('makes a skip impossible to read as a pass', () => {
    const banner = formatSkipBanner({
      host: 'example.supabase.co',
      reason: 'non-JSON response body (content-type: text/html)',
      status: 403,
      contentType: 'text/html',
      bodyPreview: '<!DOCTYPE html>',
    })
    expect(banner).toContain('SCHEMA CHECK SKIPPED')
    expect(banner).toContain('This is NOT a pass')
    expect(banner).toContain('0 tables and 0 embeds were probed')
  })
})
