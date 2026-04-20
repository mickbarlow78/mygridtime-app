#!/usr/bin/env node
// MGT-075 — Dev-only seed for ai_extraction_log.
//
// Populates the ExtractionLogView with rows covering every status branch
// (success linked to an event, success orphan, success linked to a
// soft-deleted event, error, rate_limited, validation_failed) so the UI
// can be exercised end-to-end without a real Anthropic API key.
//
// Every row is marked via source_path = 'seed/mgt-075/<uuid>' so the
// companion cleanup script can remove them deterministically.
//
// Usage: npm run seed:extractions
// Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEV_ADMIN_EMAIL

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const SEED_PREFIX = 'seed/mgt-075/'

function fail(msg) {
  console.error(`[seed:extractions] ${msg}`)
  process.exit(1)
}

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL
const srv     = process.env.SUPABASE_SERVICE_ROLE_KEY
const devMail = process.env.DEV_ADMIN_EMAIL

if (!url)     fail('NEXT_PUBLIC_SUPABASE_URL is not set.')
if (!srv)     fail('SUPABASE_SERVICE_ROLE_KEY is not set.')
if (!devMail) fail('DEV_ADMIN_EMAIL is not set (see .env.local.example).')

const admin = createClient(url, srv, { auth: { persistSession: false } })

// ── Resolve user + org ─────────────────────────────────────────────────────
const { data: userRow, error: userErr } = await admin
  .from('users')
  .select('id')
  .eq('email', devMail)
  .maybeSingle()

if (userErr)  fail(`Lookup of DEV_ADMIN_EMAIL user failed: ${userErr.message}`)
if (!userRow) fail(`No users row found for DEV_ADMIN_EMAIL=${devMail}`)

const userId = userRow.id

const { data: memberships, error: memErr } = await admin
  .from('org_members')
  .select('org_id, role, organisations:org_id ( id, name )')
  .eq('user_id', userId)
  .in('role', ['owner', 'admin', 'editor'])
  .limit(1)

if (memErr)                    fail(`Membership lookup failed: ${memErr.message}`)
if (!memberships?.length)      fail(`User ${devMail} has no owner/admin/editor org membership.`)

const orgId   = memberships[0].org_id
const orgName = memberships[0].organisations?.name ?? '(unnamed org)'

// ── Pick two events from this org (live + any for soft-delete sim) ────────
const { data: events, error: evErr } = await admin
  .from('events')
  .select('id, title, slug, deleted_at')
  .eq('org_id', orgId)
  .order('created_at', { ascending: false })
  .limit(5)

if (evErr) fail(`Event lookup failed: ${evErr.message}`)

const liveEvent    = events?.find((e) => e.deleted_at == null) ?? null
const deletedEvent = events?.find((e) => e.deleted_at != null) ?? null

// ── Build seed rows ────────────────────────────────────────────────────────
// Ordered so created_at is strictly newest → oldest when the UI sorts DESC.
const now = Date.now()
const at  = (minsAgo) => new Date(now - minsAgo * 60_000).toISOString()

const rows = [
  {
    org_id:        orgId,
    user_id:       userId,
    event_id:      liveEvent?.id ?? null,
    source_mime:   'application/pdf',
    source_bytes:  482_913,
    source_path:   `${SEED_PREFIX}${randomUUID()}.pdf`,
    model:         'claude-sonnet-4-6',
    tokens_input:  4120,
    tokens_output: 812,
    status:        'success',
    error_code:    null,
    created_at:    at(2),
  },
  {
    org_id:        orgId,
    user_id:       userId,
    event_id:      null,
    source_mime:   'image/png',
    source_bytes:  1_204_550,
    source_path:   `${SEED_PREFIX}${randomUUID()}.png`,
    model:         'claude-sonnet-4-6',
    tokens_input:  3890,
    tokens_output: 640,
    status:        'success',
    error_code:    null,
    created_at:    at(18),
  },
  {
    org_id:        orgId,
    user_id:       userId,
    event_id:      deletedEvent?.id ?? null,
    source_mime:   'application/pdf',
    source_bytes:  320_100,
    source_path:   `${SEED_PREFIX}${randomUUID()}.pdf`,
    model:         'claude-sonnet-4-6',
    tokens_input:  3500,
    tokens_output: 510,
    status:        'success',
    error_code:    null,
    created_at:    at(55),
  },
  {
    org_id:        orgId,
    user_id:       userId,
    event_id:      null,
    source_mime:   'application/pdf',
    source_bytes:  612_000,
    source_path:   `${SEED_PREFIX}${randomUUID()}.pdf`,
    model:         'claude-sonnet-4-6',
    tokens_input:  null,
    tokens_output: null,
    status:        'error',
    error_code:    'claude_call_failed',
    created_at:    at(120),
  },
  {
    org_id:        orgId,
    user_id:       userId,
    event_id:      null,
    source_mime:   'image/jpeg',
    source_bytes:  921_400,
    source_path:   `${SEED_PREFIX}${randomUUID()}.jpg`,
    model:         null,
    tokens_input:  null,
    tokens_output: null,
    status:        'rate_limited',
    error_code:    null,
    created_at:    at(240),
  },
  {
    org_id:        orgId,
    user_id:       userId,
    event_id:      null,
    source_mime:   'application/pdf',
    source_bytes:  410_800,
    source_path:   `${SEED_PREFIX}${randomUUID()}.pdf`,
    model:         'claude-sonnet-4-6',
    tokens_input:  2900,
    tokens_output: 120,
    status:        'validation_failed',
    error_code:    'schema_mismatch',
    created_at:    at(720),
  },
]

const { data: inserted, error: insErr } = await admin
  .from('ai_extraction_log')
  .insert(rows)
  .select('id, status')

if (insErr) fail(`Insert failed: ${insErr.message}`)

console.log(`[seed:extractions] Inserted ${inserted.length} rows into ai_extraction_log.`)
console.log(`  Org:          ${orgName} (${orgId})`)
console.log(`  Acting user:  ${devMail}`)
console.log(`  Linked event: ${liveEvent ? `${liveEvent.title ?? '(untitled)'} (${liveEvent.id})` : '(none available — first success row is unlinked)'}`)
console.log(`  Deleted-event sim: ${deletedEvent ? deletedEvent.id : '(no soft-deleted event in org — row falls back to unlinked)'}`)
console.log(`  Cleanup:      npm run cleanup:extractions`)
