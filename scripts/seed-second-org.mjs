#!/usr/bin/env node
// MGT-083 — QA helper: create a second organisation owned by DEV_ADMIN_EMAIL.
//
// Purpose
//   The org switcher (`<OrgSelector>`) only renders when the current user is
//   a member of 2+ organisations. To manually verify the MGT-083 fix we need
//   a dev owner who belongs to two orgs with visibly different data. This
//   script seeds the second org.
//
// What it does (in order, with loud logging)
//   1. Validates env vars and stops immediately if any are missing.
//   2. Looks up the dev user row by email.
//   3. Checks whether an org with slug "mgt-qa-org-b" already exists.
//      - If yes, reuses it (idempotent re-run).
//      - If no, inserts a new `organisations` row with name "MGT QA Org B",
//        slug "mgt-qa-org-b", and visibly distinct branding.
//   4. Checks whether the dev user is already a member of that org.
//      - If yes, leaves the membership as-is.
//      - If no, inserts an `org_members` row with role 'owner'.
//   5. Logs the final created / reused IDs and prints delete instructions.
//
// What it does NOT do
//   - Does not modify the dev user's first org.
//   - Does not modify any other memberships, events, or audit rows.
//   - Does not set an active-org cookie or touch auth tokens.
//
// Usage
//   npm run seed:mgt-083
//   (equivalent to: `node --env-file=.env.local scripts/seed-second-org.mjs`)
//
// Required env
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   DEV_ADMIN_EMAIL
//
// Cleanup
//   After verification, the created rows can be removed manually from the
//   remote Supabase project. The exact SQL is printed at the end of a
//   successful run and also documented at the bottom of this file.

import { createClient } from '@supabase/supabase-js'

const ORG_NAME = 'MGT QA Org B'
const ORG_SLUG = 'mgt-qa-org-b'
const ORG_BRANDING = {
  primaryColor: '#0066FF',
  logoUrl: 'https://example.com/mgt-qa-org-b-logo.png',
  headerText: 'Bravo HQ',
}

function fail(message) {
  console.error(`[seed-second-org] ERROR: ${message}`)
  process.exit(1)
}

function log(step, message) {
  console.log(`[seed-second-org] step ${step}: ${message}`)
}

// ── 1. Validate env ───────────────────────────────────────────────────────
log(1, 'validating env')

const supabaseUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey     = process.env.SUPABASE_SERVICE_ROLE_KEY
const devAdminEmail      = process.env.DEV_ADMIN_EMAIL

if (!supabaseUrl)    fail('NEXT_PUBLIC_SUPABASE_URL is not set')
if (!serviceRoleKey) fail('SUPABASE_SERVICE_ROLE_KEY is not set')
if (!devAdminEmail)  fail('DEV_ADMIN_EMAIL is not set')

log(1, `url=${supabaseUrl}`)
log(1, `devAdminEmail=${devAdminEmail}`)

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

// ── 2. Look up dev user ───────────────────────────────────────────────────
log(2, `looking up user with email=${devAdminEmail}`)

const { data: userRow, error: userErr } = await admin
  .from('users')
  .select('id, email')
  .eq('email', devAdminEmail)
  .maybeSingle()

if (userErr)  fail(`user lookup failed: ${userErr.message}`)
if (!userRow) fail(`no users row found for email=${devAdminEmail}`)

const userId = userRow.id
log(2, `found user id=${userId}`)

// ── 3. Find or create org ─────────────────────────────────────────────────
log(3, `checking for existing organisation slug=${ORG_SLUG}`)

const { data: existingOrg, error: existingErr } = await admin
  .from('organisations')
  .select('id, name, slug, branding')
  .eq('slug', ORG_SLUG)
  .maybeSingle()

if (existingErr) fail(`existing-org lookup failed: ${existingErr.message}`)

let orgId
let orgAction
if (existingOrg) {
  orgId     = existingOrg.id
  orgAction = 'reused existing'
  log(3, `found existing org id=${orgId} name="${existingOrg.name}"`)
} else {
  log(3, `no existing org — creating name="${ORG_NAME}" slug=${ORG_SLUG}`)
  const { data: createdOrg, error: createErr } = await admin
    .from('organisations')
    .insert({
      name:     ORG_NAME,
      slug:     ORG_SLUG,
      branding: ORG_BRANDING,
    })
    .select('id, name, slug, branding')
    .single()

  if (createErr)  fail(`org insert failed: ${createErr.message}`)
  if (!createdOrg) fail('org insert returned no row')

  orgId     = createdOrg.id
  orgAction = 'newly created'
  log(3, `created org id=${orgId} branding=${JSON.stringify(createdOrg.branding)}`)
}

// ── 4. Find or create membership ──────────────────────────────────────────
log(4, `checking membership for user=${userId} org=${orgId}`)

const { data: existingMember, error: memberLookupErr } = await admin
  .from('org_members')
  .select('user_id, org_id, role')
  .eq('user_id', userId)
  .eq('org_id',  orgId)
  .maybeSingle()

if (memberLookupErr) fail(`membership lookup failed: ${memberLookupErr.message}`)

let membershipAction
if (existingMember) {
  membershipAction = `reused existing membership (role=${existingMember.role})`
  log(4, membershipAction)
} else {
  log(4, 'no membership — inserting as owner')
  const { error: insertMemberErr } = await admin
    .from('org_members')
    .insert({ user_id: userId, org_id: orgId, role: 'owner' })

  if (insertMemberErr) fail(`membership insert failed: ${insertMemberErr.message}`)
  membershipAction = 'newly created membership as owner'
  log(4, membershipAction)
}

// ── 5. Summary + delete instructions ──────────────────────────────────────
log(5, 'done')
console.log('')
console.log('SEEDED RESULT')
console.log('-------------')
console.log(`user.id          = ${userId}`)
console.log(`user.email       = ${devAdminEmail}`)
console.log(`org.id           = ${orgId}`)
console.log(`org.name         = ${ORG_NAME}`)
console.log(`org.slug         = ${ORG_SLUG}`)
console.log(`org action       = ${orgAction}`)
console.log(`membership action= ${membershipAction}`)
console.log('')
console.log('TO DELETE AFTER VERIFICATION')
console.log('----------------------------')
console.log('Run the following SQL against the remote Supabase project')
console.log('(via the Supabase dashboard SQL editor or psql):')
console.log('')
console.log(`  DELETE FROM org_members WHERE org_id = '${orgId}';`)
console.log(`  DELETE FROM organisations WHERE id = '${orgId}';`)
console.log('')
console.log('No other rows are touched by this script.')
