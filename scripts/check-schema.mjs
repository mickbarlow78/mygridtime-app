#!/usr/bin/env node
// MGT-110 / DEC-045 — CI schema-drift gate.
//
// Fails the build when application code references a database table or a
// relationship the LIVE target schema does not have.
//
// Why "live" and not "the repo's migrations": at commit 3c4220b — the build that
// ran broken in production for two months — supabase/migrations/ did NOT contain
// 20260424000000. Migrations said `organisations`, code said `organisations`, and
// the repo was perfectly self-consistent. The divergence was never inside the
// repo; it was between the repo and production. See DEC-045.
//
// Fail surface is exactly two PostgREST codes, both produced verbatim by MGT-109:
//   PGRST205 — table missing from the schema cache
//   PGRST200 — relationship embed does not resolve
// Everything else (401/403 permission denial, 5xx, Cloudflare WAF HTML, timeouts)
// either passes or SKIPS LOUDLY. It never silently passes.
//
// Usage:  npm run check:schema
// Also runs automatically as `prebuild`, so every `npm run build` is gated.
// Requires: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
//           (SUPABASE_SERVICE_ROLE_KEY is preferred when present)

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SENTINEL_TABLE,
  classifyProbe,
  extractTableRefs,
  extractEmbedRefs,
  normaliseAllowlist,
  isTableAllowed,
  isEmbedAllowed,
  staleAllowlistEntries,
  formatPassBanner,
  formatSkipBanner,
  formatFailBanner,
  formatUnsoundBanner,
} from '../src/lib/schema-check/core.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = path.join(ROOT, 'src')
const SCHEMA_CHECK_DIR = path.join(SRC_DIR, 'lib', 'schema-check')
const ALLOWLIST_PATH = path.join(ROOT, 'supabase', 'schema-check.allow.json')

const TIMEOUT_MS = 8000
const CONCURRENCY = 8

async function collectSourceFiles(dir) {
  const out = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await collectSourceFiles(full)))
      continue
    }
    if (!/\.(ts|tsx|mjs)$/.test(entry.name)) continue
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue
    // The gate must not scan itself: core.mjs contains `.from(` inside its own
    // extraction regexes and documentation, which the scanner would otherwise
    // read as unresolvable dynamic table references.
    if (full.startsWith(SCHEMA_CHECK_DIR)) continue
    out.push({
      path: path.relative(ROOT, full).replace(/\\/g, '/'),
      source: await readFile(full, 'utf8'),
    })
  }
  return out
}

/**
 * Fill unset Supabase vars from .env.local when running locally.
 *
 * Done in-script rather than via `node --env-file=` because prebuild must never
 * be the thing that breaks a build: a missing .env.local, or a Node build image
 * without the flag, would abort the build before next build even starts. Only
 * fills variables that are not already set, so the Netlify build environment
 * always wins.
 */
async function hydrateLocalEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return
  try {
    const raw = await readFile(path.join(ROOT, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (!m) continue
      const value = m[2].replace(/^['"]|['"]$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = value
    }
  } catch {
    // No .env.local — fine. The missing-credentials skip banner handles it.
  }
}

async function loadAllowlist() {
  try {
    return normaliseAllowlist(JSON.parse(await readFile(ALLOWLIST_PATH, 'utf8')))
  } catch (err) {
    if (err && err.code === 'ENOENT') return normaliseAllowlist(null)
    console.error(`[check:schema] ${ALLOWLIST_PATH} is not valid JSON: ${err.message}`)
    process.exit(1)
  }
}

async function probe(baseUrl, key, query) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/rest/v1/${query}`, {
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    })
    return classifyProbe({
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      body: await res.text(),
    })
  } catch (err) {
    return classifyProbe({ status: 0, contentType: '', body: String((err && err.message) || err) })
  } finally {
    clearTimeout(timer)
  }
}

/** Run tasks with a small concurrency cap so a big table list is still one build second. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

async function main() {
  const started = Date.now()

  await hydrateLocalEnv()

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!rawUrl || !key) {
    console.log(
      formatSkipBanner({
        host: 'unknown',
        reason:
          'NEXT_PUBLIC_SUPABASE_URL and/or a Supabase key are not set in this environment',
        status: 0,
        contentType: '',
      })
    )
    return 0
  }

  const baseUrl = rawUrl.replace(/\/+$/, '')
  const host = (() => {
    try {
      return new URL(baseUrl).host
    } catch {
      return baseUrl
    }
  })()

  const [files, allowlist] = await Promise.all([collectSourceFiles(SRC_DIR), loadAllowlist()])
  const { tables, dynamic } = extractTableRefs(files)
  const embeds = extractEmbedRefs(files)

  // ---------------------------------------------------------------------
  // Self-test first. A gate nobody has seen fail is not known to work, so
  // prove the gate CAN fail before trusting anything it reports.
  // ---------------------------------------------------------------------
  const sentinel = await probe(baseUrl, key, `${SENTINEL_TABLE}?select=*&limit=0`)

  if (sentinel.kind === 'unverifiable') {
    // Cannot reach PostgREST cleanly — skip the whole run, loudly.
    console.log(
      formatSkipBanner({
        host,
        reason: `sentinel probe unverifiable: ${sentinel.reason}`,
        status: sentinel.status ?? 0,
        contentType: '',
        bodyPreview: sentinel.bodyPreview,
      })
    )
    return 0
  }

  if (sentinel.kind !== 'missing-table') {
    // We got a clean JSON answer, and it was not PGRST205. The gate's core
    // assumption is broken — refuse to report a pass.
    console.error(formatUnsoundBanner({ host, sentinelResult: sentinel }))
    return 1
  }

  // ---------------------------------------------------------------------
  // Real probes.
  // ---------------------------------------------------------------------
  const tableNames = [...tables.keys()].sort()
  const tableResults = await mapLimit(tableNames, CONCURRENCY, (name) =>
    probe(baseUrl, key, `${encodeURIComponent(name)}?select=*&limit=0`)
  )
  const embedResults = await mapLimit(embeds, CONCURRENCY, (e) =>
    probe(baseUrl, key, `${encodeURIComponent(e.table)}?select=${encodeURIComponent(e.select)}&limit=0`)
  )

  // A WAF block or outage part-way through means the run verified only some of
  // what it claims. Treat that as a skip too — a partial pass is a false pass.
  const firstUnverifiable = [...tableResults, ...embedResults].find((r) => r.kind === 'unverifiable')
  if (firstUnverifiable) {
    console.log(
      formatSkipBanner({
        host,
        reason: `a probe became unverifiable part-way through: ${firstUnverifiable.reason}`,
        status: firstUnverifiable.status ?? 0,
        contentType: '',
        bodyPreview: firstUnverifiable.bodyPreview,
      })
    )
    return 0
  }

  const missingTables = []
  const unexpected = []
  tableNames.forEach((name, i) => {
    const r = tableResults[i]
    if (r.kind === 'missing-table' && !isTableAllowed(allowlist, name)) {
      missingTables.push({ name, locations: tables.get(name) ?? [] })
    }
    if (r.kind === 'unexpected') {
      unexpected.push(`table ${name}: HTTP ${r.status} code=${r.code ?? 'none'} ${r.message ?? ''}`.trim())
    }
  })

  const missingEmbeds = []
  embeds.forEach((e, i) => {
    const r = embedResults[i]
    if (r.kind === 'missing-relationship' && !isEmbedAllowed(allowlist, e.table, e.select)) {
      missingEmbeds.push(e)
    }
    if (r.kind === 'unexpected') {
      unexpected.push(`embed ${e.table} "${e.select}": HTTP ${r.status} code=${r.code ?? 'none'}`)
    }
  })

  let dynamicExcess = null
  if (dynamic.length > allowlist.dynamicFromBaseline) {
    dynamicExcess = [
      `Dynamic .from() calls: ${dynamic.length}, baseline ${allowlist.dynamicFromBaseline}.`,
      'A table name that cannot be resolved statically cannot be probed, so it',
      'would be an unchecked hole in this gate. Either use a string literal, or',
      'raise dynamicFromBaseline in the allowlist with a reason.',
      ...dynamic.slice(0, 10).map((d) => `  - ${d.path}:${d.line}`),
    ].join('\n')
  }

  if (missingTables.length || missingEmbeds.length || dynamicExcess) {
    console.error(formatFailBanner({ host, missingTables, missingEmbeds, dynamicExcess }))
    return 1
  }

  const stale = staleAllowlistEntries(allowlist, {
    tables: tableNames.filter((n, i) => tableResults[i].kind === 'missing-table'),
    embeds: embeds
      .filter((_, i) => embedResults[i].kind === 'missing-relationship')
      .map((e) => ({ from: e.table, select: e.select })),
  })

  console.log(
    formatPassBanner({
      host,
      tableCount: tableNames.length,
      embedCount: embeds.length,
      elapsedMs: Date.now() - started,
      unexpected,
      stale,
    })
  )
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // An unexpected crash in the gate itself must not silently pass, but must
    // also not be mistaken for schema drift.
    console.error('[check:schema] the gate itself crashed — this is a bug in the gate, not schema drift')
    console.error(err)
    process.exit(1)
  })
