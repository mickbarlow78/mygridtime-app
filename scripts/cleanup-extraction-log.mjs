#!/usr/bin/env node
// MGT-075 — Dev-only cleanup for rows written by scripts/seed-extraction-log.mjs.
//
// Deletes every ai_extraction_log row whose source_path begins with
// 'seed/mgt-075/'. Safe to run repeatedly; a no-op when nothing is seeded.
//
// Usage: npm run cleanup:extractions

import { createClient } from '@supabase/supabase-js'

const SEED_PREFIX = 'seed/mgt-075/'

function fail(msg) {
  console.error(`[cleanup:extractions] ${msg}`)
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const srv = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url) fail('NEXT_PUBLIC_SUPABASE_URL is not set.')
if (!srv) fail('SUPABASE_SERVICE_ROLE_KEY is not set.')

const admin = createClient(url, srv, { auth: { persistSession: false } })

const { data, error } = await admin
  .from('ai_extraction_log')
  .delete()
  .like('source_path', `${SEED_PREFIX}%`)
  .select('id')

if (error) fail(`Delete failed: ${error.message}`)

console.log(`[cleanup:extractions] Removed ${data.length} seeded row(s).`)
