// MGT-110 — Pure core for the CI schema-drift gate (DEC-045).
//
// Implemented as .mjs (same pattern as src/lib/retention/extractions.mjs) so the
// Node runner script can import it directly with no build step, while vitest
// still covers it via the sibling .test.ts. Types live in the sibling .d.ts.
//
// EVERYTHING IN THIS FILE IS PURE. No fs, no fetch, no process. All I/O lives in
// scripts/check-schema.mjs. That split is what makes the negative test in
// core.test.ts a real regression test rather than a network-dependent flake.

/**
 * The two PostgREST error codes this gate fails on, and nothing else.
 * Both were produced verbatim by the MGT-109 outage:
 *   PGRST205 -> "Could not find the table 'public.organisations' in the schema cache"
 *   PGRST200 -> "Could not find a relationship between 'events' and 'organisations'"
 */
export const FAIL_CODES = {
  MISSING_TABLE: 'PGRST205',
  MISSING_RELATIONSHIP: 'PGRST200',
}

/**
 * The sentinel table used to prove the gate is capable of failing.
 * `organisations` was removed by migration 20260424000000 and can never
 * legitimately return 200 again. If probing it does NOT yield PGRST205, the
 * gate's core assumption is broken and the run must not report a pass.
 */
export const SENTINEL_TABLE = 'organisations'

/**
 * Classify a single PostgREST probe response.
 *
 * Deliberately conservative: only a definitive JSON body carrying PGRST205 /
 * PGRST200 counts as a failure. A 401/403 means the table exists but the role
 * cannot read it — PostgREST resolves the schema cache BEFORE permissions, so
 * permission denial is never a schema signal. Anything non-JSON (Cloudflare WAF
 * block pages, proxy errors, timeouts) is 'unverifiable' and must surface via
 * the loud SKIPPED banner rather than being counted as a pass.
 */
export function classifyProbe({ status, contentType = '', body = '' }) {
  const isJson = String(contentType).toLowerCase().includes('application/json')

  if (!isJson) {
    return {
      kind: 'unverifiable',
      reason:
        status === 0
          ? 'no HTTP response (network error or timeout)'
          : `non-JSON response body (content-type: ${contentType || 'none'})`,
      status,
      bodyPreview: String(body).slice(0, 200),
    }
  }

  let parsed = null
  try {
    parsed = JSON.parse(body)
  } catch {
    return {
      kind: 'unverifiable',
      reason: 'response claimed JSON but did not parse',
      status,
      bodyPreview: String(body).slice(0, 200),
    }
  }

  const code = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.code : null

  if (code === FAIL_CODES.MISSING_TABLE) {
    return { kind: 'missing-table', status, code, message: parsed.message ?? '' }
  }
  if (code === FAIL_CODES.MISSING_RELATIONSHIP) {
    return { kind: 'missing-relationship', status, code, message: parsed.message ?? '' }
  }

  // Table exists and is readable.
  if (status >= 200 && status < 300) return { kind: 'ok', status }

  // Table exists; the role just cannot read it. Not a schema failure.
  if (status === 401 || status === 403) return { kind: 'ok', status, note: 'permission denied' }

  // Upstream trouble — cannot conclude anything about the schema.
  if (status >= 500) {
    return { kind: 'unverifiable', reason: `upstream error ${status}`, status }
  }

  // A real PostgREST error we deliberately do not fail on (e.g. an unknown
  // column). Reported in the summary so it cannot pass unnoticed, but it does
  // not block the build — the fail surface is exactly two codes.
  return { kind: 'unexpected', status, code: code ?? null, message: (parsed && parsed.message) || '' }
}

function lineOf(source, index) {
  let line = 1
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++
  }
  return line
}

/**
 * Identify what a `.from(` call is hanging off, so non-database `.from()` calls
 * are excluded structurally rather than by maintaining a name blocklist.
 * Returns 'Array' | 'Buffer' | 'storage' | 'client'.
 */
export function receiverOf(source, dotIndex) {
  const before = source.slice(Math.max(0, dotIndex - 160), dotIndex).replace(/\s+$/, '')
  if (/(?:^|[^A-Za-z0-9_$])Array$/.test(before)) return 'Array'
  if (/(?:^|[^A-Za-z0-9_$])Buffer$/.test(before)) return 'Buffer'
  if (/\.storage$/.test(before)) return 'storage'
  return 'client'
}

const LITERAL_FROM = /^\.from\(\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*\)/
const SELECT_LITERAL = /\.select\(\s*(['"])([^'"]*)\1/

/**
 * Extract every statically-resolvable Supabase table reference, plus a count of
 * `.from()` calls on a Supabase client whose argument is NOT a string literal.
 *
 * files: Array<{ path: string, source: string }>
 */
export function extractTableRefs(files) {
  const tables = new Map()
  const dynamic = []

  for (const { path, source } of files) {
    const re = /\.from\(/g
    let m
    while ((m = re.exec(source)) !== null) {
      const at = m.index
      const receiver = receiverOf(source, at)
      if (receiver !== 'client') continue

      const literal = LITERAL_FROM.exec(source.slice(at))
      const location = { path, line: lineOf(source, at) }

      if (!literal) {
        dynamic.push(location)
        continue
      }

      const name = literal[2]
      if (!tables.has(name)) tables.set(name, [])
      tables.get(name).push(location)
    }
  }

  return { tables, dynamic }
}

/**
 * Extract `(table, selectString)` pairs where the select string contains an
 * embed — i.e. anything with a `(` in it.
 *
 * CRITICAL (see DEC-045): this deliberately does NOT parse the embed grammar.
 * MGT-109's second error (PGRST200) came from a relationship embed inside a
 * select() projection, not from a .from() call, and this codebase uses three
 * different embed syntaxes — `championships!inner(slug)`, `users:user_id (
 * email )`, and `users!championship_members_user_id_fkey(email)`. Rather than
 * maintain a parser that can be outgrown, the whole select string is replayed
 * through PostgREST, which is the exact component that produced PGRST200.
 */
export function extractEmbedRefs(files) {
  const embeds = []

  for (const { path, source } of files) {
    const re = /\.from\(/g
    let m
    while ((m = re.exec(source)) !== null) {
      const at = m.index
      if (receiverOf(source, at) !== 'client') continue

      const literal = LITERAL_FROM.exec(source.slice(at))
      if (!literal) continue

      // Bound the search window at the next `.from(` so a select belonging to a
      // different chain can never be misattributed to this table.
      const rest = source.slice(at + literal[0].length)
      const nextFrom = rest.search(/\.from\(/)
      const window = rest.slice(0, nextFrom === -1 ? 400 : Math.min(nextFrom, 400))

      const sel = SELECT_LITERAL.exec(window)
      if (!sel) continue
      if (!sel[2].includes('(')) continue

      embeds.push({
        table: literal[2],
        select: sel[2],
        path,
        line: lineOf(source, at),
      })
    }
  }

  // Deduplicate identical (table, select) pairs — the same query shape appears
  // in several files and only needs probing once.
  const seen = new Set()
  return embeds.filter((e) => {
    const key = `${e.table}::${e.select}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Normalise a possibly-missing allowlist file into a known shape. */
export function normaliseAllowlist(raw) {
  const a = raw && typeof raw === 'object' ? raw : {}
  return {
    tables: Array.isArray(a.tables) ? a.tables : [],
    embeds: Array.isArray(a.embeds) ? a.embeds : [],
    dynamicFromBaseline:
      typeof a.dynamicFromBaseline === 'number' && a.dynamicFromBaseline >= 0
        ? a.dynamicFromBaseline
        : 0,
  }
}

export function isTableAllowed(allowlist, name) {
  return allowlist.tables.some((t) => t && t.name === name)
}

export function isEmbedAllowed(allowlist, table, select) {
  return allowlist.embeds.some((e) => e && e.from === table && e.select === select)
}

/**
 * Report allowlist entries that no longer suppress anything, so suppressions
 * cannot silently accumulate. `failures` is the set that WOULD have failed.
 */
export function staleAllowlistEntries(allowlist, failures) {
  const failedTables = new Set(failures.tables ?? [])
  const failedEmbeds = new Set((failures.embeds ?? []).map((e) => `${e.from}::${e.select}`))

  const stale = []
  for (const t of allowlist.tables) {
    if (t && !failedTables.has(t.name)) stale.push(`table "${t.name}" (${t.reason ?? 'no reason given'})`)
  }
  for (const e of allowlist.embeds) {
    if (e && !failedEmbeds.has(`${e.from}::${e.select}`)) {
      stale.push(`embed ${e.from} -> "${e.select}" (${e.reason ?? 'no reason given'})`)
    }
  }
  return stale
}

// ---------------------------------------------------------------------------
// Banners.
//
// Amendment 2 / DEC-045: this whole workstream exists because a monitoring
// control failed SILENTLY. A skip must therefore be impossible to miss in a
// build log, and a pass must state how many things it actually verified — a
// pass that checked zero things must not look like a pass that checked
// nineteen. ASCII only: Netlify build logs are not reliably UTF-8.
// ---------------------------------------------------------------------------

const WIDE = 74

function box(char, lines) {
  const bar = char.repeat(WIDE)
  return ['', bar, ...lines.map((l) => `${char}  ${l}`), bar, ''].join('\n')
}

export function formatPassBanner({ host, tableCount, embedCount, elapsedMs, unexpected = [], stale = [] }) {
  const lines = [
    'SCHEMA CHECK PASSED',
    '',
    `Host          : ${host}`,
    `Tables probed : ${tableCount}`,
    `Embeds probed : ${embedCount}`,
    `Sentinel      : '${SENTINEL_TABLE}' correctly classified MISSING (${FAIL_CODES.MISSING_TABLE})`,
    `Elapsed       : ${elapsedMs}ms`,
  ]
  if (unexpected.length) {
    lines.push('', `Unexpected (not failed on, ${unexpected.length}):`)
    for (const u of unexpected.slice(0, 10)) lines.push(`  - ${u}`)
  }
  if (stale.length) {
    lines.push('', `Stale allowlist entries (${stale.length}) - safe to delete:`)
    for (const s of stale.slice(0, 10)) lines.push(`  - ${s}`)
  }
  return box('=', lines)
}

export function formatSkipBanner({ host, reason, status, contentType, bodyPreview }) {
  return box('#', [
    'SCHEMA CHECK SKIPPED - NOTHING WAS VERIFIED',
    '',
    'This is NOT a pass. 0 tables and 0 embeds were probed.',
    '',
    `Host         : ${host}`,
    `Reason       : ${reason}`,
    `HTTP status  : ${status}`,
    `Content-Type : ${contentType || 'none'}`,
    ...(bodyPreview ? [`Body         : ${String(bodyPreview).replace(/\s+/g, ' ').slice(0, 120)}`] : []),
    '',
    'A Cloudflare WAF block against supabase.co returns an HTML page, not a',
    'PostgREST body, and lands here. That is a known live condition on this',
    'project - see KNOWN_ISSUES JAVASCRIPT-NEXTJS-6. The build is allowed to',
    'proceed because blocking deploys on transient network failure is worse',
    'than the disease, but nothing about the schema has been checked.',
  ])
}

export function formatFailBanner({ host, missingTables, missingEmbeds, dynamicExcess }) {
  const lines = ['SCHEMA CHECK FAILED', '', `Host : ${host}`, '']

  if (missingTables.length) {
    lines.push(`Tables referenced in code but ABSENT from the live schema (${missingTables.length}):`)
    for (const t of missingTables) {
      lines.push(`  - ${t.name}  [${FAIL_CODES.MISSING_TABLE}]`)
      for (const loc of t.locations.slice(0, 5)) lines.push(`      ${loc.path}:${loc.line}`)
      if (t.locations.length > 5) lines.push(`      ... and ${t.locations.length - 5} more`)
    }
    lines.push('')
  }

  if (missingEmbeds.length) {
    lines.push(`Relationship embeds that do not resolve (${missingEmbeds.length}):`)
    for (const e of missingEmbeds) {
      lines.push(`  - from '${e.table}' select "${e.select}"  [${FAIL_CODES.MISSING_RELATIONSHIP}]`)
      lines.push(`      ${e.path}:${e.line}`)
    }
    lines.push('')
  }

  if (dynamicExcess) {
    // Split so every line gets the box prefix — an unprefixed line in the
    // middle of a banner reads as unrelated build output.
    lines.push(...String(dynamicExcess).split('\n'), '')
  }

  lines.push(
    'This is the MGT-109 failure shape: deployed code querying a schema that',
    'does not have what it asks for. Fix the code, or - if the reference is',
    'legitimate - add an entry with a reason to',
    'supabase/schema-check.allow.json.'
  )

  return box('!', lines)
}

export function formatUnsoundBanner({ host, sentinelResult }) {
  return box('!', [
    'SCHEMA CHECK UNSOUND - REFUSING TO REPORT A PASS',
    '',
    `The sentinel probe for '${SENTINEL_TABLE}' returned a clean JSON response`,
    `that was NOT ${FAIL_CODES.MISSING_TABLE}. That table was removed by migration`,
    '20260424000000 and must not resolve.',
    '',
    `Host     : ${host}`,
    `Got      : kind=${sentinelResult.kind} status=${sentinelResult.status} code=${sentinelResult.code ?? 'none'}`,
    '',
    'Either the table has been recreated, or PostgREST no longer reports a',
    'missing table the way this gate assumes. Until that is resolved the gate',
    'cannot distinguish a missing table from a healthy one, so it would always',
    'pass. A gate that cannot fail is worse than no gate.',
  ])
}
