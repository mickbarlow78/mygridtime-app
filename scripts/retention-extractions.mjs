#!/usr/bin/env node
// MGT-081 — Manual runner for the 30-day retention helper.
//
// Imports the shared runExtractionRetention() helper directly and builds a
// service-role Supabase client. Does NOT hit the cron HTTP route — the app
// server does not need to be running. Route and script are two independent
// wrappers over the same helper.
//
// Usage: npm run retention:extractions
// Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'
import { runExtractionRetention } from '../src/lib/retention/extractions.mjs'

function fail(msg) {
  console.error(`[retention:extractions] ${msg}`)
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const srv = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url) fail('NEXT_PUBLIC_SUPABASE_URL is not set.')
if (!srv) fail('SUPABASE_SERVICE_ROLE_KEY is not set.')

const admin = createClient(url, srv, { auth: { persistSession: false } })

const result = await runExtractionRetention({ admin })

console.log(
  `[retention:extractions] rowsDeleted=${result.rowsDeleted} ` +
    `objectsRemoved=${result.objectsRemoved} ` +
    `storageErrors=${result.storageErrors.length}`,
)
for (const e of result.storageErrors) {
  console.log(`  storage error: ${e}`)
}
