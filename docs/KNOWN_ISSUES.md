# Known Issues

## MGT-083: Top-bar org switcher did not refresh the Organisation settings page — resolved 2026-04-20

**Description**: When an owner belonging to 2+ organisations changed the active org via the top-bar `<OrgSelector>` dropdown, the `/admin` layout updated correctly (title, dropdown selection), but `/admin/orgs/settings` continued to display the previous org's name, slug, branding, members, invites, extraction log, and audit log until a manual browser refresh. Silently stale settings on a mutable page is dangerous — an owner could edit Org B believing they were editing Org A (or vice versa).

**Root cause**: The page RSC (`src/app/admin/orgs/settings/page.tsx`) correctly re-executed on `router.refresh()` and passed new props to `<SettingsPanels>` on org switch. But the client form components inside `SettingsPanels` (`OrgNameForm`, `BrandingForm`, etc.) seed their local `useState(...)` from props only at mount. Because React reconciles the same component identity across RSC re-renders, those `useState` values never re-initialised with the new org's data — the forms stayed on the previous org.

Contributing weakness: `switchOrg()` in `src/app/admin/orgs/actions.ts` called `revalidatePath('/admin')`, which only invalidates the exact `/admin` route, not nested routes like `/admin/orgs/settings`. `router.refresh()` picked up the new cookie regardless (the settings page is dynamic via cookies), so this was not the visible cause — but the scope was inconsistent with Next 14 semantics for an app-wide org switch.

**Fix**: Two-line change.

1. `src/app/admin/orgs/settings/page.tsx` — added `key={org.id}` to `<SettingsPanels>`. On org change, React fully unmounts and remounts the client subtree, so every child form re-seeds its `useState` from the new props. Standard React idiom for "treat this prop change as a new instance."
2. `src/app/admin/orgs/actions.ts` — inside `switchOrg()` changed `revalidatePath('/admin')` to `revalidatePath('/admin', 'layout')` so the entire `/admin` layout subtree is invalidated on switch (belt-and-braces alongside `router.refresh()`). No other `revalidatePath('/admin')` call sites were touched — individual mutations keep their narrower, correct scope.

Known tradeoff (acceptable): an unsaved edit in `OrgNameForm`/`BrandingForm` is discarded when the user switches org mid-edit. This is the correct UX — stale draft values must not bleed across orgs.

**Status**: Resolved (2026-04-20). Deploy impact: code only (2 lines); no schema; no env; no migrations; no DB state change.

**Verification**: dev-server dual-org end-to-end pass on 2026-04-20. Seeded a second organisation `MGT QA Org B` (slug `mgt-qa-org-b`, primary colour `#0066FF`, logo `example.com/mgt-qa-org-b-logo.png`, header text `Bravo HQ`) owned by the dev admin via the new standalone `scripts/seed-second-org.mjs` (npm script `seed:mgt-083`) — idempotent find-or-create against `organisations` + `org_members`, logs every step, fails loudly on missing env, prints DELETE SQL for cleanup. Verified Org A `MGT-060 Verify Org` (colour `#FF0000`, logo `logo-v3.png`, no header text) vs Org B values are visibly distinct. Loaded `/admin/orgs/settings` as Org A, dispatched a native `change` event on the top-bar `<OrgSelector>` to switch to Org B, and re-read the page DOM after the RSC refresh. Every field updated without manual browser refresh: `h1`, `OrgNameForm` name input, public URL (slug text), `BrandingForm` colour pickers + logo URL + header text. Repeated the switch three full A↔B cycles — each cycle restored the correct org's values with no cross-bleed and no stale draft values leaking across switches. Browser console: zero errors and zero warnings across the full run. Unsaved draft discard on mid-edit switch behaves as expected (acceptable tradeoff noted above).

---

## MGT-082: Production event creation failed with `duplicate key value violates unique constraint "events_slug_key"` — resolved 2026-04-20

**Description**: `events.slug` carried a global `UNIQUE` constraint (`events_slug_key`) from the original schema. When two organisations — or the same organisation over time — attempted to create events with the same title (e.g. "Round 1"), the `generateUniqueSlug` helper would suffix (`round-1`, `round-1-2`, …) until it found a free slot, but under concurrency and across orgs the constraint still produced the raw Postgres error to end users on the admin create flow. The auto-suffix also produced URLs users never chose, which is particularly bad for printed collateral and QR codes.

**Fix**: Per-org slug uniqueness + nested canonical public URL. Full rationale in DEC-036. Summary:

1. Migration `20260420000000_events_slug_org_scoped.sql` drops `events_slug_key` and adds composite `UNIQUE (org_id, slug)` (`events_org_id_slug_key`).
2. Canonical public URL moves to `/{orgSlug}/{eventSlug}` (new `src/app/(public)/[slug]/[eventSlug]/page.tsx` + `/print`).
3. Top-level `/{slug}` resolves org first; falls back to a 308 redirect to the canonical nested URL iff exactly one published event still matches the slug (ambiguous matches → 404).
4. `createEvent`, `duplicateEvent`, `createEventFromTemplate` now use `computeEventSlug(orgId, title)` — an org-scoped pre-check with no auto-suffix. On collision, the server action returns `"An event with this title already exists in this organisation. Please choose a different title."`, surfaced verbatim in the existing `ERROR_BANNER` on `/admin/events/new`.
5. All link generators (sitemap, publish / updated emails, landing page, `PublicOrgView`, `/my/[timetableId]`, admin URL preview) emit canonical nested URLs.
6. `revalidatePublicEventPaths` now invalidates `/[orgSlug]/[eventSlug]` and `/[slug]` together.

**Status**: Resolved (2026-04-20) — see DEC-036. Deploy impact: code + migration + path invalidation; no env changes; manual verification required (see *Verification* below).

---

## MGT-071-BLOCKED: AI extraction requires ANTHROPIC_API_KEY (env not configured)

**Scope**: MGT-069 + MGT-070 code paths are intact and the two supporting migrations are applied to the linked remote Supabase project (`hxxderwxxpfzdxlmsqpl`, 2026-04-17 via `supabase db push`). Real extraction cannot run end-to-end until `ANTHROPIC_API_KEY` is populated in the dev/staging env.

**User-facing signal**: `/admin/events/new` → **From PDF / image** tab remains visible but the file input is rendered `disabled` and an inline `ERROR_BANNER` above it reads *"AI extraction not configured yet. This feature will be enabled once API access is set up."* Readiness is driven by `NEXT_PUBLIC_AI_EXTRACTION_READY`, derived at Next boot from the real `ANTHROPIC_API_KEY` presence in [next.config.mjs](../next.config.mjs) (`(process.env.ANTHROPIC_API_KEY?.trim() ?? '') !== '' ? 'true' : 'false'`). The secret itself is never exposed to the client bundle — only the derived boolean string.

**Server behaviour unchanged**: with the flag on and the key missing, `extractWithClaude` throws at [src/lib/ai/extract.ts:290](../src/lib/ai/extract.ts), is caught at [src/app/admin/events/extract/actions.ts:258-278](../src/app/admin/events/extract/actions.ts), writes `ai_extraction_log { status: 'error', error_code: 'claude_call_failed' }`, and returns the generic user-facing error — identical to any other SDK-path failure. The UI gate makes this unreachable in the normal flow, so no erroneous log rows are produced by unsuspecting users.

**Unblocks when**: `ANTHROPIC_API_KEY` is set in the target env and the Next process is restarted. The MGT-071 happy-path verification plan (one real extraction → `ai_extraction_log` success row → Storage object → audit detail with model + token counts) resumes at step 3 once the key lands.

---

## MGT-069: AI-assisted event extraction — Phase A UX scaffold ships with a hardcoded mock response; real Claude Vision integration + observability + guardrails deferred to MGT-070

**Scope (Phase A, landed 2026-04-17)**: `/admin/events/new` has a third `From PDF / image` tab. Upload + client validation (PDF/PNG/JPG, 10 MB cap) → `extractEventFromUpload(formData)` server action gates on `requireEditor()`, re-validates MIME + byte length server-side, waits 800 ms, and returns the hardcoded `MOCK_EXTRACTED_EVENT` fixture from `src/lib/ai/extract.ts`. `ExtractionPreview` renders the mock as an editable form; `Create event` chains `createEvent()` → `saveExtractedEventContent(eventId, days, meta)` with cascade-rollback on partial failure; `Discard and start from scratch` resets the page with no server hit. Audit rows are written as `event.created_from_extraction` with `detail.mock = true` so they remain filterable post-Phase-B cutover.

**Explicitly deferred to MGT-070 (Phase B)**: ~~the `@anthropic-ai/sdk` dependency~~, ~~the real Claude Vision tool-call body of `extractEventFromUpload`~~, ~~the `ai_extraction_log` table + migration + RLS policy~~, ~~the private `event-extractions` Supabase Storage bucket + migration + RLS policy~~, ~~the per-org 20-extractions/24h rate-limit pre-flight check~~, ~~the `ANTHROPIC_API_KEY` + `MGT_EXTRACT_MODEL` + `MGT_AI_EXTRACTION_ENABLED` env vars (and their entry in `src/lib/env.ts`)~~, and ~~token-count / cost fields on the audit detail~~. **All shipped 2026-04-17 via MGT-070 — see DEC-030.**

**Also deferred (not owned by MGT-070)**: consumer-side upload (`/my/upload` stays "Coming soon"), batch / multi-file extraction (#16), re-extraction into an existing event, template creation from extraction. Paid-tier gating of extraction depends on #14 Stripe. ~~The scheduled cleanup cron for the Storage bucket's 30-day retention~~ — shipped 2026-04-20 via MGT-081 (see DEC-035).

**Why this split is fine**: the shared `ExtractedEvent` / `ExtractedDay` / `ExtractedEntry` contract in `src/lib/ai/extract.ts` is the single source of truth — Phase B swaps the action body without changing the client, the preview UI, the audit writer, or the insert path. The mock response is deterministic, fully typed, and truncated against `FIELD_LIMITS` before it leaves the server, so Phase A cannot produce data that Phase B would then reject.

**Status**: Phase A resolved by MGT-069 (2026-04-17). Phase B resolved by MGT-070 (2026-04-17) — see DEC-030. 30-day Storage retention cron resolved by MGT-081 (2026-04-20) — see DEC-035. Remaining deferred items (consumer `/my/upload`, batch extraction, template-from-extraction, paid-tier gating) carried forward as noted above.

---

## MGT-062: `org_member.role_updated` summary rendered nothing — renderer read `email`/`from`/`to` but payload writes `target_email` + `changes.role.{from,to}`

**Description**: `OrgAuditLogView`'s `MemberRoleDetail` type declared `email?`, `from?`, `to?`, `old_role?`, `new_role?` and both the UI renderer (`MemberActionSummary`) and CSV formatter (`formatDetailForCsv`) destructured those top-level keys. The server-side `updateMemberRole()` action at `src/app/admin/orgs/actions.ts:425-438` actually writes `{ org_id, target_user_id, target_email, changes: { role: { from, to } } }` — none of the top-level keys the renderer read existed. Both call sites began `if (!from || !to) return …`, so they bailed before rendering. Result: every `org_member.role_updated` row in the panel rendered only the action label + actor + timestamp, with no summary line; the CSV Summary column was empty for the same rows. MGT-060 found and fixed the identical pattern on `org_member.removed` but explicitly scoped `role_updated` as a follow-up — MGT-062 is that follow-up.

Compounding factor (same as MGT-060): `users_select_own` RLS at `src/app/admin/orgs/actions.ts:398-400` nulls out `users.email` on the `users!org_members_user_id_fkey(email)` join for non-self rows. So even after renaming the field, `target_email` is `null` whenever an owner changes *another* member's role (the common case). A renderer without the `'a member'` fallback would still render nothing in that case.

**Impact**: No data loss — the payload is complete (`target_user_id` + `changes.role.{from,to}` + `org_id` are always present). Forensic reconstruction remained possible via the CSV Detail column (raw JSON). But the panel's primary UX promise ("one-line human summary per audit row") silently failed for every role-changed row in production.

**Status**: Resolved (MGT-062) — UI-only fix in `src/components/admin/OrgAuditLogView.tsx`, mirroring the MGT-060 pattern:
- `MemberRoleDetail` type corrected to `{ target_email?: string | null; changes?: { role?: { from?: string; to?: string } } }`.
- `MemberActionSummary` renderer (line ~264-279) now reads `target_email` + `changes?.role?.{from,to}`, falls back to `a member` when `target_email` is null, and early-returns `null` only when both `from` and `to` are missing.
- CSV formatter (line ~155-162) applies the same `target_email ?? 'a member'` fallback so the Summary column carries `a member: Admin -> Owner` / `<email>: Admin -> Owner` consistently with the UI.
- No server-side change, no schema change, no RLS change. No remaining out-of-scope sibling actions — all six member-action renderer branches in `OrgAuditLogView` now align with their emission payloads.

**Verification**: dev-server end-to-end pass on 2026-04-17 against the existing `MGT-060 Verify Org`. Seeded a second member `mgt062-testmember@mygridtime.dev` via the service-role client at role `admin` (RLS prevents a second normal user without a full invite/accept loop in the dev harness). Promoted `admin → owner` then demoted `owner → admin` through the UI's role `<select>` + confirmation modal. Audit panel now renders `a member: Admin → Owner` and `a member: Owner → Admin` with the red/green from/to styling; CSV Summary column carries `a member: Admin -> Owner` and `a member: Owner -> Admin`. No regression on `Removed a member (was Editor)` / `Removed a member (was Admin)` rows. `npm run typecheck` clean; full vitest suite 62/62 green.

---

## MGT-060: `org_member.removed` summary rendered nothing — renderer read `email` but payload writes `target_email`

**Description**: `OrgAuditLogView`'s `MemberRemovedDetail` type declared `email?: string` and both the UI renderer (`MemberActionSummary`) and the CSV formatter (`formatDetailForCsv`) destructured `{ email, previous_role }` from the payload. The server-side `removeMember()` action at `src/app/admin/orgs/actions.ts:495-507` writes `{ org_id, target_user_id, target_email, previous_role }` — there is no `email` key. Both call sites began with `if (!email) return …`, so they bailed before rendering. Result: every `org_member.removed` row in the panel rendered only the action label + actor + timestamp, with no summary line; the CSV Summary column was empty for the same rows. MGT-059 had threaded `previous_role` through but was never exercised end-to-end in a live org, so the field-name mismatch was latent until MGT-060.

Compounding factor: the server-side comment at `src/app/admin/orgs/actions.ts:457-458` documents that `users_select_own` RLS nulls out `users.email` for non-self rows. So even after renaming the field, `target_email` is frequently `null` in practice (admin removes another member → `target_email: null`). A renderer that bailed on missing email still produced no summary.

**Impact**: No data loss — the payload is complete (`target_user_id` + `previous_role` + `org_id` are always present). Forensic reconstruction remained possible via the CSV Detail column (raw JSON). But the panel's primary UX promise ("one-line human summary per audit row") silently failed for every member-removed row in production.

**Status**: Resolved (MGT-060) — UI-only fix in `src/components/admin/OrgAuditLogView.tsx`:
- `MemberRemovedDetail` type corrected to `{ target_email?: string | null; previous_role?: string }`.
- `MemberActionSummary` renderer (line ~280-290) now reads `target_email`, falls back to `a member` when null, and only early-returns when **both** `target_email` and `previous_role` are missing (so a role-only row still renders `Removed a member (was Admin)`).
- CSV formatter (line ~164-168) applies the same `target_email ?? 'a member'` fallback so the Summary column carries `Removed a member (was Editor)` / `Removed <email> (was Admin)` consistently with the UI.
- No server-side change, no schema change, no RLS change. `role_updated` had the same latent `email` vs `target_email` mismatch — addressed in MGT-062 (see entry above).

**Verification**: dev-server end-to-end pass on 2026-04-17 against a fresh org `MGT-060 Verify Org` — inserted a non-owner member via service-role (RLS prevents a second normal user without a full invite/accept loop in the dev harness) at role `admin`, then again at role `editor`. Removed each via the UI's Remove button + confirmation modal. Audit panel now renders `Removed a member (was Admin)` and `Removed a member (was Editor)`; CSV Summary column carries the same strings. `npm run typecheck` clean; full vitest suite 62/62 green.

---

## MGT-067: Permissions audit — no real permission gap found

**Description**: A focused audit of the admin and platform-staff permission surface was run to confirm whether any server action, RLS policy, or UI affordance was granting access outside the intended model. The audit reviewed the two load-bearing rules: (1) DEC-006 — all row-level authorization is enforced at the database via RLS policies routed through `get_user_org_role()`, so server actions do not need manual auth checks; and (2) DEC-018 — platform staff (`users.platform_role IN ('staff','support')`) reach any org as an effective `'owner'` via the `get_user_org_role()` short-circuit plus the five SELECT policies extended with `OR is_platform_staff()`, with the `via: 'platform' | 'membership'` discriminator preserved on `ActiveOrg` and `audit_log.actor_context`.

**Impact**: None. The audit confirmed the enforcement paths match the decisions on record. No RLS policy bypasses `get_user_org_role()` where it should not; no server action grants access independently of RLS; the DEC-018 `via` discriminator is written on every audit row so platform-reached access is never presented as customer ownership.

**Status**: Resolved — not a defect. No code, schema, RLS, migration, or UI change. Entry retained for traceability so a future audit does not re-run the same review from scratch.

---

## MGT-057: Event-scoped audit coverage — three day-level mutations (`addEventDay`, `removeEventDay`, `updateDayLabel`) wrote no `audit_log` row, and MGT-054's "10/10" event-side coverage claim was incorrect

**Description**: `src/app/admin/events/actions.ts` contains 10 mutating server actions. Seven of them already wrote `audit_log` rows via `writeAuditLog()` (`src/lib/audit.ts:44`), but three day-level mutations on `event_days` did not, even though each one has (or can cheaply resolve) a valid `eventId` and can use the existing event-scoped audit infrastructure unchanged:

- `addEventDay` (`src/app/admin/events/actions.ts:653`) — extends the event schedule by a calendar day. `eventId` is a direct parameter.
- `removeEventDay` (`src/app/admin/events/actions.ts:704`) — deletes a day row and (via its own pre-delete cascade) every `timetable_entries` row on it. Takes only `dayId`; parent `event_id` had to be resolved by a pre-delete lookup.
- `updateDayLabel` (`src/app/admin/events/actions.ts:744`) — renames the public-facing label of a day (visible on the rendered timetable). Takes only `dayId`; `event_id` + previous label had to be pre-fetched.

Secondary docs-drift symptom: MGT-054 (`KNOWN_ISSUES.md`, previous version) stated every mutating action in `events/actions.ts` "(10/10)" already wrote audit rows, and separately referenced `event_day.added` in a list of "existing `entity.past_tense_verb`" action names — that string did not occur anywhere in `src/` at the time. Both drift lines pointed at the same underlying gap.

The existing `timetable.updated` row (written by `saveDayEntries()` on substantive add/remove/edit/reorder within existing days) did not shadow the three gaps above: day structure (adding a whole day, removing a whole day, renaming a day's label) happens through the three direct helpers, not through `saveDayEntries`, so the gap was genuine.

**Impact**: No customer-visible defect. Mutations still committed and returned the correct `ActionResult`, and the MGT-023 → MGT-028 hardening (Sentry capture with action sub-tags, generic user-facing error strings) was in place. The gap was a forensics / compliance gap: anyone auditing "who added day X on Y", "who removed it", or "who renamed it from A to B" had to reconstruct the sequence from `event_days` row state + Sentry breadcrumbs, with no single-source filterable / exportable record. Platform-reached (DEC-018) day-level access was therefore also absent from the audit trail.

**Status**: Resolved — event-scoped audit coverage for `events/actions.ts` is now 10/10.

- **`addEventDay`** now writes `event_day.added` with `detail: { day_id, date, label }`. `user` is destructured from the existing `requireEditor()` call; the row is written after the successful insert and before `revalidateAdminEventPaths()` / `revalidatePublicEventPaths()`, so audit side-effects don't block revalidation.
- **`removeEventDay`** performs a single `select('event_id, date, label')` on `event_days` **before** the cascade-delete of `timetable_entries` and the `event_days` delete, so `event_id` is in hand when the audit row is written. The audit row (`event_day.removed`) includes `{ day_id, date, label }` captured from the pre-delete snapshot. A lookup failure returns the existing generic error (`'Could not remove this day. Please retry.'`) with a Sentry capture tagged `removeEventDay.lookup` — an un-resolvable `event_id` is a legitimate failure mode, not a no-op.
- **`updateDayLabel`** pre-fetches `event_id` + current `label` so the audit detail uses the `{ changes: { label: { from, to } } }` diff shape consistent with `event.updated`. The audit row (`event_day.label_updated`) is suppressed when `from === to`, mirroring `saveDayEntries`'s `hasSubstantiveChanges` gate so a "no-op save" does not generate a row. Verified manually: entering the existing label and committing produces no new audit entry.
- **No schema change, no RLS change, no migration, no `writeAuditLog()` signature change, no notification-system touch, no `VersionHistory` touch, no new helper.** `actor_context` continues to be stamped via the existing `makeActorContext(membership)` helper (DEC-018), so platform-reached vs. genuine-membership day-level edits are distinguishable in the trail.
- **UI**: `src/components/admin/AuditLogView.tsx` gained three entries each in `actionLabels` and `filterOptions` — `event_day.added` → "Day added", `event_day.removed` → "Day removed", `event_day.label_updated` → "Day label updated" — inserted between the `event.*` lifecycle group and `timetable.updated` to keep lifecycle → structure → content grouping intact. No custom detail renderer added: the existing fallback path renders the action label, user email, and timestamp cleanly (matching the existing treatment of `event.published` / `event.unpublished` / `event.archived` / `event.duplicated` / `template.created` / `event.created_from_template`). A nested diff renderer is a follow-up and is explicitly out of scope.
- **`NotificationLogView`** untouched — day-level mutations don't emit `notification_log` rows (per DEC-002/DEC-003, metadata-adjacent changes don't notify) so they don't belong in that dropdown.
- **Verification**: `npm run typecheck` clean; `npm test` green (62/62, unchanged suite); `npm run build` succeeds. Dev-server manual pass on `/admin/events/{id}` (Europe/London, BST, 2026-04-17): added day "MGT-057 audit test day" on 2026-04-20 → audit count 12 → 13, top row "Day added · mickbarlow@kiontechnology.co.uk · 17 Apr 2026, 16:33"; double-click the tab and rename to "MGT-057 renamed label" → audit count 13 → 14, top row "Day label updated · … · 16:36"; double-click the tab and commit the identical label → audit count stays at 14 (no-op suppression confirmed); remove the day → audit count 14 → 15, top row "Day removed · … · 16:37". Filter dropdown shows the three new options in the intended position and selecting "Day added" narrows the list to exactly the one matching entry. CSV export unaffected (new action strings flow through the same `filteredEntries` pipeline). No regression on `saveDayEntries` — an entry-level edit continues to write `timetable.updated` and none of the three new actions fire from that path.
- **Docs**: MGT-054 sentence "every mutating action in `src/app/admin/events/actions.ts` (10/10)" is corrected to "(10/10 after MGT-057 closed; previously 7/10)"; the incidental `event_day.added` reference in MGT-054 is annotated "(landed via MGT-057)" for traceability. `docs/PROJECT_STATUS.md` audit-log bullet is extended to name the new action strings. `docs/DECISIONS.md` gets no new entry: this is an application of the already-active DEC-014 audit-log model to three under-covered call sites, not a new rule. `docs/LAUNCH_PLAN.md` untouched (audit coverage is not a launch gate).

Out of scope, deferred: `deleteTemplate` in `src/app/admin/templates/actions.ts:205` has no audit coverage — templates are `org_id`-scoped (`src/lib/types/database.ts:337`), so no valid `eventId` exists for an already-created template row and the current event-bound audit model cannot cover it without a signature change. Belongs with MGT-054's org-audit work, not here.

---

## MGT-054: Org audit logging coverage gap — `src/app/admin/orgs/actions.ts` mutations are not written to `audit_log`, and the table's current shape does not support org-scoped entries

**Description**: Every mutating server action in `src/app/admin/orgs/actions.ts` completes without writing a row to `audit_log`. A repo-wide `grep` for `writeAuditLog(` inside that file returns zero matches. The uncovered mutations are:

- `createOrganisation` (line 42) — inserts `organisations` + `org_members` (owner row)
- `updateOrganisation` (line 199) — updates `organisations.name` / `organisations.slug`
- `updateOrgBranding` (line 234) — updates `organisations.branding` (logo, colour, header text)
- `updateMemberRole` (line 315) — updates `org_members.role` *(highest-value missing action — privilege change, canonical audit case)*
- `removeMember` (line 363) — deletes `org_members`
- `inviteMember` (line 441) — inserts `org_invites`
- `revokeInvite` (line 547) — deletes `org_invites`
- `acceptInvite` (line 573) — inserts `org_members` + updates `org_invites.accepted_at`

(`switchOrg` mutates only a cookie and `listOrgMembers` / `listOrgInvites` are read-only, so no audit row is expected for those three.)

By contrast, every mutating action in `src/app/admin/events/actions.ts` (10/10 after MGT-057 closed; previously 7/10 — see MGT-057) and `saveAsTemplate` + `createEventFromTemplate` in `src/app/admin/templates/actions.ts` already write audit rows via the shared `writeAuditLog()` helper in `src/lib/audit.ts:44`. The org-governance surface is therefore the one remaining 100%-coverage gap in the admin server-action layer.

Closing even the single highest-value gap (`updateMemberRole`) is not a pure code-reuse pass because `audit_log` is event-scoped today:

- **No `audit_log.org_id` column.** The table (`supabase/migrations/20260327000000_create_base_schema.sql:122`) has `event_id uuid REFERENCES events(id)` and no direct reference to `organisations`.
- **INSERT policy requires a valid event_id.** `audit_log_insert_members` (`supabase/migrations/20260328000001_fix_audit_log_insert_policy.sql:13`) checks `event_id IN (SELECT e.id FROM events e WHERE get_user_org_role(e.org_id) IN ('owner','admin','editor'))`. A row with `event_id = NULL` evaluates the `IN` subquery to UNKNOWN and is silently denied under the authenticated Supabase client.
- **SELECT policy is also event-scoped.** `audit_log_select_admin` (`supabase/migrations/20260327000000_create_base_schema.sql:365`) restricts reads to rows whose `event_id` resolves to an org where the caller is `owner` or `admin`. Org-only rows would be invisible to the existing admin audit-log UI (`src/components/admin/AuditLogView.tsx`).
- **`writeAuditLog()` signature requires `eventId`.** The helper at `src/lib/audit.ts:44` declares `eventId: string` as a mandatory positional parameter and writes `event_id: eventId` into the insert payload. Calling it with `eventId = ''` or a synthetic value would produce an FK violation or a meaningless row; extending it to accept an optional `orgId` is a signature change that touches every existing caller.

**Impact**: No customer-visible defect today. Every org action still mutates correctly, returns the correct `ActionResult`, and carries the MGT-023 → MGT-028 hardening (Sentry capture with action sub-tags, generic user-facing error strings, no raw Postgres leaks). The gap is a compliance and forensics gap: privilege changes (`updateMemberRole`), access revocations (`removeMember`), and invite lifecycle events leave no in-product trail that can be filtered, searched, or exported from the admin audit-log UI. Support can reconstruct the timeline from `org_members`, `org_invites`, and Sentry breadcrumbs, but there is no single-source audit record answering "who promoted this user to owner, when, from what role?". The gap becomes more load-bearing the moment multi-admin orgs exist at any scale.

**Status**: Resolved (MGT-055) — Path 1 (schema + RLS extension) landed as the core backend/data-layer pass. All 8 mutating actions in `src/app/admin/orgs/actions.ts` now write `audit_log` rows; the table is dual-scoped and the shared `writeAuditLog()` helper takes a discriminated-union `scope` argument. The UI-side read surface for org-scoped rows (generalised `AuditLogView` / dedicated org audit panel) is explicitly deferred to a follow-up pass and is NOT part of this fix — the event-editor `AuditLogView` continues to query by `event_id` only and does not yet surface org rows. → UI surface shipped in MGT-057, live-refresh in MGT-058.

**Migration** (`supabase/migrations/20260417000000_org_audit_log.sql`):
- `audit_log.org_id uuid REFERENCES organisations(id)` added (nullable).
- `CHECK ((event_id IS NULL) <> (org_id IS NULL))` (constraint `audit_log_scope_xor`) enforces exactly one scope per row — no fake `event_id`, no dual-scope rows.
- `audit_log_insert_members` re-created with both branches: the event branch (unchanged) OR `org_id IS NOT NULL AND get_user_org_role(org_id) IN ('owner','admin','editor')`.
- `audit_log_select_admin` re-created with both branches analogously for `owner`/`admin`.
- `get_user_org_role()` and `is_platform_staff()` unchanged — the existing Phase A short-circuit continues to make platform staff effective `'owner'` for both branches (DEC-018).

**Helper** (`src/lib/audit.ts`):
- New `AuditScope = { eventId: string } | { orgId: string }` discriminated-union.
- `writeAuditLog()` signature changed from positional `eventId: string` to `scope: AuditScope`. Insert payload writes `event_id` or `org_id` based on the scope variant; the other column is NULL. Never throws, swallows errors to Sentry — contract unchanged.
- Always uses the caller's authenticated Supabase client — no admin-client audit fallback (explicitly rejected — option 2 above was **not** taken).

**Call sites** — all 13 existing event/template audit call-sites migrated to `{ eventId }` with no behavioural change (`src/app/admin/events/actions.ts` × 12, `src/app/admin/templates/actions.ts` × 2). `AuditLogEntry` + both `loadAllAuditLog` / `loadMoreAuditLog` raw-row types + the event editor page's raw type extended with `org_id: string | null` so the row flows cleanly through the AuditLogView prop type intersection. No runtime change to the AuditLogView rendering.

**Org instrumentation** — 8 new audit rows in `src/app/admin/orgs/actions.ts`:
- `createOrganisation` → `organisation.created` with `{ org_id, name, slug }`, `via: 'membership'`. Written after the owner membership insert commits so RLS resolves `get_user_org_role(org.id) = 'owner'`.
- `updateOrganisation` → `organisation.updated` with `{ changes: { name: { from, to } } }`; suppressed when name unchanged.
- `updateOrgBranding` → `organisation.branding_updated` with a per-field `{ changes: { primaryColor?: {from,to}, logoUrl?: {from,to}, headerText?: {from,to} } }` diff; suppressed when no field changed.
- `inviteMember` → `org_member.invited` with `{ org_id, email, role, invite_id }`. `invite.id` now included in the admin-client insert's `.select()` list (was `.select('token')`, now `.select('id, token')`).
- `revokeInvite` → `org_member.invite_revoked` with `{ org_id, invite_id, email }`; email captured pre-delete.
- `updateMemberRole` → `org_member.role_updated` with `{ org_id, target_user_id, target_email, changes: { role: { from, to } } }`; suppressed when role unchanged. `target_email` joined via `users!org_members_user_id_fkey(email)` through the authenticated client — `users_select_own` RLS can null this for non-self rows, audit row still writes cleanly with `target_user_id`.
- `removeMember` → `org_member.removed` with `{ org_id, target_user_id, target_email, previous_role }` captured pre-delete (same users-RLS caveat as above).
- `acceptInvite` → `org_member.invite_accepted` with `{ org_id, invite_id, role }`, `via: 'membership'`. Written after the membership insert + invite-mark-accepted, so the acceptor's RLS role resolves correctly. The early-return branch (user was already a member) is intentionally not audited — no membership state changes on that branch.

`actorContext` for actions guarded by `requireOwnerOrAdmin()` is built via `makeActorContext(activeOrg)` so platform-reached vs. genuine-membership org actions remain distinguishable (DEC-018). `createOrganisation` and `acceptInvite` use `{ via: 'membership' }` directly — the acting user is becoming a genuine new owner / invited member through the normal path.

**DEC-025** ("`audit_log` dual-scope — exactly one of `event_id` / `org_id`, discriminated-union `scope` in `writeAuditLog()`, no admin-client audit fallback") codifies the new rule.

**Out of scope / explicit follow-ups (unchanged)**:
- `deleteTemplate` in `src/app/admin/templates/actions.ts` still has no audit coverage — out of scope for MGT-055, belongs to a later templates pass.
- `AuditLogView` generalisation to render org-scoped rows alongside event-scoped rows — not pursued; a dedicated org-audit entry point in org settings now exists as `OrgAuditLogView` on `/admin/orgs/settings`, consuming `loadAuditLog({ orgId })` with org-specific labels and detail renderers (MGT-057 resolved).

**Verification**: `npm run typecheck` clean; `npm test` 62/62 green; `npm run build` succeeds. Migration is additive (one column, one CHECK, two re-created policies). Manual DB step: YES (migration must be applied to Supabase). Deploy: YES (Netlify). Manual end-to-end dev-server pass: complete (exercised via MGT-057 UI, MGT-060 / MGT-062 renderer fixes, MGT-063 / MGT-065 positive-branch verification).

---

## MGT-053: NotificationLogView filter plumbing encoded the same date-range key map in three places, and the Clear filters button inlined a fourth copy of clearAllFilters()

**Description**: Over the MGT-047 → MGT-052 chain, `src/components/admin/NotificationLogView.tsx` accumulated three overlapping textual representations of the same underlying `(DateRangeKey → { from, to })` map. (1) Nine `is{X}Active` boolean consts (`isTodayActive` / `isYesterdayActive` / `isLast7DaysActive` / `isLast30DaysActive` / `isThisMonthActive` / `isLastMonthActive` / `isThisYearActive` / `isLastYearActive` / `isAllTimeActive`) compared `(dateFrom, dateTo)` against preset ISO pairs. (2) A `dateRangeValue` ternary chain walked those booleans to derive the dropdown's current key. (3) A `handleDateRangeChange` switch wrote hand-keyed ISO pairs back into `dateFrom` / `dateTo`. The same table of range-key-to-ISO-pair mappings was effectively re-typed three times in source order, plus a fourth implicit copy in `applyPreset()` which hand-keyed the `today` pair rather than going through the map. Separately, the **Clear filters** button's `onClick` inlined the exact 5-setter body of the already-declared `clearAllFilters()` helper rather than calling the helper by reference — a live second source of truth for "reset all filters." Every one of the four range-map sites and the two clear-all sites was logically identical but textually separate.

**Impact**: Zero user-visible correctness defect. `dateRangeValue` is purely derived from `(dateFrom, dateTo)`, so every mutation path (preset chip, dropdown change, manual date input, clear) already landed in a consistent end-state. The consistency tax was structural — any future add/remove/rename of a date range had to be repeated in three places in lockstep, and the inline Clear-button body meant a future "reset all filters" shape change had to be kept in sync between `clearAllFilters()` and its inline twin. A drift between the sites could not produce an observable bug today, but the surface area for a future drift was disproportionate to the problem's complexity.

**Status**: Resolved — client-only refactor scoped to `src/components/admin/NotificationLogView.tsx`. A new file-local, render-time-computed `dateRangePresets: Record<AppliableDateRangeKey, { from: string; to: string }>` map (where `AppliableDateRangeKey = Exclude<DateRangeKey, 'custom'>`) declares the nine concrete range-key-to-ISO-pair mappings in one place, computed from today's local-calendar date via the existing `toLocalIsoDate()` helper (DEC-024) and the `Date` constructor's built-in day/month/year rollover. The nine `is{X}Active` booleans and the `dateRangeValue` ternary chain are replaced by a single `.find()` over `Object.entries(dateRangePresets)` that derives the dropdown's current key, falling back to `'custom'` when `(dateFrom, dateTo)` matches none of the preset pairs. `handleDateRangeChange(value)` collapses to `const { from, to } = dateRangePresets[value]; setDateFrom(from); setDateTo(to)` — the 10-case switch body is removed. `applyPreset()` reads `dateRangePresets.today` instead of hand-keying `todayIso` twice. The **Clear filters** button's `onClick` is replaced with `clearAllFilters` by reference, eliminating the inlined 5-setter twin. `todayIso` remains declared as its own const because the three triage-preset activity checks (`isFailuresToday` / `isSentToday` / `isPublishedToday`) compare against it directly — this is the only reason any individual ISO const survives outside the map. Every piece of JSX (every chip, dropdown, input, button, label, class name, aria attribute), the prop interface `NotificationLogViewProps`, the server action `loadAllNotificationLog()`, the `NotificationLogEntry` type, the `loadAll()` / `useEffect` / `refreshSignal` / `loadError` / `capped` behaviour, the `filteredEntries` `useMemo` filter pipeline (status → type → dates → search), the CSV export (`entriesToCsv` / `downloadCsv` / `handleExportCsv`) and its consumption of `filteredEntries`, the row rendering, the empty-state copy, the Retry banner, and the cap warning are all unchanged. No new state, no new prop, no new dependency, no backend / schema / RLS / migration / notification-writer change. The purely-derived `dateRangeValue` model is retained rather than forced to `'custom'` after manual From/To edits — the stronger consistency guarantee (dropdown is always truthful about what `(dateFrom, dateTo)` represents) is preferred over flag-based "source of edit" tracking, consistent with the "no new state" constraint. `npm run typecheck` clean; full vitest suite (62/62) green; `npm run build` succeeds. Dev-server manual pass on `/admin/events/{id}` (Europe/London, currently BST, 3 existing notification_log rows): panel open renders identically; **Failures today** → `(failed, '', today=2026-04-17, today)` / 0 rows / `aria-pressed=true` / Clear filters button visible; **Failures today** again → all cleared; **Sent today** → `(sent, '', today, today)` / 3 rows / pressed; **Published today** (from Sent today) → `('', event.published, today, today)` / 1 row / pressed — confirms mutual-exclusion replace rather than accumulation; **Clear filters** → all five state pieces reset, button disappears; Date-range dropdown cycle: **Today** `2026-04-17/2026-04-17`, **Yesterday** `2026-04-16/2026-04-16`, **Last 7 days** `2026-04-11/2026-04-17`, **Last 30 days** `2026-03-19/2026-04-17`, **This month** `2026-04-01/2026-04-17`, **Last month** `2026-03-01/2026-03-31`, **This year** `2026-01-01/2026-04-17`, **Last year** `2025-01-01/2025-12-31`, **All time** `''/''` — each re-read of the dropdown correctly reflects its own key on re-render; manual From/To `2026-04-10 / 2026-04-15` → dropdown flips to disabled **Custom** option; manual From/To `2026-04-17 / 2026-04-17` → dropdown shows **Today** (intentional consistency with the derived model); Status dropdown, Type dropdown, and Search input each change their own slice without touching others; no console errors. The single `dateRangePresets` map is now the sole source of truth for the range-key-to-ISO-pair mapping, and `clearAllFilters()` is the sole source of truth for the reset-all action.

---

## MGT-052: NotificationLogView filter bar was visually crowded — 9 date chips + 4 redundant status/type chips dominated the panel

**Description**: After the incremental chip additions across MGT-047 → MGT-051, `src/components/admin/NotificationLogView.tsx` rendered four rows of filter controls: Row 1 with 3 triage preset chips (Failures today / Sent today / Published today), Row 2 with 13 equal-weight toggle chips (4 status/type — Failed, Sent, Published, Timetable updated — plus 9 date chips — Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, This year, Last year, All time), Row 3 with Status + Type dropdowns and a Search input, and Row 4 with From / To custom date inputs + Clear filters + Export CSV. The chip wall on Row 2 was hard to scan at a glance because every chip had identical visual weight, the 9 date chips dominated the horizontal space, and the 4 status/type chips in the same row duplicated the Status + Type dropdowns directly below them — so the "is the failure rate up today?" glance cost a scan across a strip of ~13 buttons before the eye even reached the triage preset row.

**Impact**: Low-friction but persistent UX tax on the notification triage flow. No correctness issue — every filter capability worked — but the visual density discouraged fast scanning and the redundancy (4 status/type chips + Status/Type dropdowns covering the same state) made the panel feel cluttered rather than information-dense. Admins reported the filter bar felt crowded.

**Status**: Resolved — client-only change scoped to `src/components/admin/NotificationLogView.tsx`. The 9 date chips are folded into a single **Date range** `<select>` sitting between the existing Type dropdown and the Search input on Row 2; options are **All time**, **Today**, **Yesterday**, **Last 7 days**, **Last 30 days**, **This month**, **Last month**, **This year**, **Last year**. The dropdown's `value` is derived purely from the existing `is{Today,Yesterday,Last7Days,Last30Days,ThisMonth,LastMonth,ThisYear,LastYear,AllTime}Active` booleans (no new state); a disabled **Custom** option surfaces automatically when the current `dateFrom` / `dateTo` state falls through to none of the preset pairs (i.e. the admin typed a manual range into the From/To inputs on Row 3). `handleDateRangeChange()` switches on the selected key and writes the existing local-calendar ISO pair into `setDateFrom` / `setDateTo` via the DEC-024 helpers (`toLocalIsoDate()` and `Date`-constructor offsets). The 4 redundant status/type quick-filter chips (Failed, Sent, Published, Timetable updated) are removed — the Status + Type dropdowns on Row 2 continue to drive that filter state. Row 1 (3 triage preset chips) and Row 3 (From / To + Clear + Export) are unchanged; the From/To inputs remain available for custom ranges outside the 9 presets. Reuses `filteredEntries` `useMemo`, `applyPreset()`, `clearAllFilters()`, `chipClass()`, every state hook, and every ISO-derivation variable verbatim — no new filter logic, no new state, no new prop. No backend, schema, RLS, migration, or notification-writer change. DEC-024 scope note updated: the rule governing local-calendar `YYYY-MM-DD` generation now applies to the ISO pairs the new Date range `<select>` writes on the former chips' behalf. Client-side only; one file touched.

---

## MGT-051: NotificationLogView date-chip helpers mixed UTC and local-calendar models, risking off-by-one filters and a wrong-month "This month" preset outside UTC

**Description**: `src/components/admin/NotificationLogView.tsx` (lines 172–179 before this fix) derived the five date-preset chip strings through two incompatible models in the same block. `todayIso`, `yesterdayIso`, `sevenDaysAgoIso`, and `thirtyDaysAgoIso` used `new Date(...).toISOString().slice(0, 10)` — i.e. the **UTC** calendar date and millisecond-subtraction arithmetic. `firstOfMonthIso` constructed a local-midnight `Date` via `new Date(now.getFullYear(), now.getMonth(), 1)` but then rendered it through `.toISOString().slice(0, 10)`, which for any positive UTC offset (UK BST included) converts local-midnight-of-the-1st into the UTC date of the last day of the previous month. Meanwhile the filter pipeline at lines 143–150 parses the same strings as **local** (`new Date(dateFrom + 'T00:00:00')` / `T23:59:59.999`), and `<input type="date">` returns local-calendar values. The chip strings and their consumers therefore disagreed on what calendar day a `YYYY-MM-DD` meant.

**Impact**: Three observable defects outside UTC. (1) Between 00:00–01:00 local in any `UTC+N` zone (including UK in BST), the **Today** chip wires `dateFrom`/`dateTo` to yesterday's calendar date and the filter silently excludes every row created during that first hour of local today. (2) On the 1st of the month in any positive offset, the **This month** preset's active-state comparison and applied filter span into the previous calendar month. (3) Millisecond subtraction is DST-unsafe — on a spring-forward day, subtracting `86_400_000` ms from local midnight lands at 23:00 the previous local day, so the UTC-ISO projection of that moment can in principle land on the wrong calendar day. No correctness risk during UK winter (UTC == local), but the UI misbehaves every BST summer after midnight and on the first day of any month — and the bug expands the moment an organiser opens the panel from a non-UK timezone.

**Status**: Resolved — client-only change scoped to `src/components/admin/NotificationLogView.tsx`. A single file-local helper `toLocalIsoDate(d: Date): string` (placed next to the existing `formatTimestamp` / CSV helpers at file-top) formats a `Date` via its local `getFullYear` / `getMonth` / `getDate` components, zero-padded. All five chip strings now derive from it — `todayIso` from `today` itself; `yesterdayIso` / `sevenDaysAgoIso` / `thirtyDaysAgoIso` from `new Date(y, m, d - 1 | 6 | 29)` (the `Date` constructor's built-in rollover handles day/month/year boundaries and DST correctly, unlike millisecond subtraction); `firstOfMonthIso` from `new Date(y, m, 1)`. `todayIso` is now identical to what `<input type="date">` returns for today and to what the filter's `new Date(iso + 'T00:00:00')` parse expects. No filter semantics change, no UX flow change, no change to the five per-chip active-state comparisons (`isTodayActive` etc.), no change to the `applyPreset` helper or to the three daily-triage presets (Failures today / Sent today / Published today) which inherit the corrected `todayIso` automatically. No server-action, schema, RLS, or migration change; `AuditLogView.tsx` intentionally left alone (its sole `toISOString().slice(0, 10)` use is for a CSV filename, which is an artefact label rather than a filter input). `npm run typecheck` clean; full vitest suite (62/62) green. Dev-server manual pass on `/admin/events/{id}` in Europe/London (currently BST, offset -60): **Today** → `2026-04-17 / 2026-04-17`; **Yesterday** → `2026-04-16 / 2026-04-16`; **Last 7 days** → `2026-04-11 / 2026-04-17`; **Last 30 days** → `2026-03-19 / 2026-04-17`; **This month** → `2026-04-01 / 2026-04-17` (was the old bug's prime failure case — old code would have produced `2026-03-31` after any future BST month-rollover); **Failures today / Sent today / Published today** each correctly drive `dateFrom` and `dateTo` to `2026-04-17` and flip `aria-pressed` on toggle; every chip clears both date inputs on a second click; no console errors. Codified as DEC-024.

---

## MGT-050: NotificationLogView's three highest-frequency triage views still required two chip clicks after MGT-049

**Description**: After MGT-049 added the quick-filter chip row (Failed, Sent, Published, Timetable updated, Today), the three views admins reach for most — "just the failures from today", "just what actually sent today", and "just publish notifications today" — still required two chip clicks: one on a status or type chip and one on the Today chip. The underlying filter state (`statusFilter`, `typeFilter`, `dateFrom`, `dateTo`) and the `filteredEntries` `useMemo` already supported each of those views correctly — the gap was purely that those daily triage compositions were not surfaced as one-click affordances on top of the already-shipped chip row.

**Impact**: Low-friction but very-high-frequency UX gap on the delivery-triage flow. Zero correctness issue — every view was reachable through the existing chips — but the daily "is anything failing right now?" and "what went out today?" scan cost 2× the click budget of every other common view.

**Status**: Resolved — client-only change scoped to `src/components/admin/NotificationLogView.tsx`. A new chip row labelled `Presets` sits as the first child of the existing filter block (above the MGT-049 quick-filter chip row) and renders three toggle `<button>` presets in source order: **Failures today**, **Sent today**, **Published today**. Each preset writes into the already-declared `statusFilter` / `typeFilter` / `searchQuery` / `dateFrom` / `dateTo` hooks via two small inline helpers (`applyPreset({ statusFilter, typeFilter })` sets the target composition + clears search + sets both date inputs to `todayIso`; `clearAllFilters()` mirrors the existing Clear-filters button and zeroes all five state pieces). Active state is derived inline per render by comparing the current state tuple to each preset's shape (so clicking the existing raw **Sent** quick-filter chip while **Failures today** is active correctly re-projects the aria-pressed: the tuple now matches **Sent today** instead) — no new state was added. Each preset reuses the existing `chipClass(active, activeClasses)` helper with the palette of its dominant slice (red for Failures today, green for Sent today, blue for Published today), uses `aria-pressed` for active state, and respects the existing `controlsDisabled` flag. Clicking an already-active preset clears all five filter state pieces; clicking a different preset fully replaces the state rather than overlaying, so presets are mutually exclusive by construction. No new filter logic, no new server action, no change to the filter pipeline, existing MGT-049 chip row, dropdowns, search input, date inputs, CSV export, Retry banner, cap warning, or row rendering. `npm run typecheck` clean, full vitest suite (62/62) passes, dev-server manual pass on `/admin/events/{id}` confirmed: **Failures today** narrows 3 → 0 with empty-state copy, status dropdown reading `failed`, date inputs on today, search empty; clicking it again restores 3; **Sent today** narrows to 3 (all 3 test rows are sent + today); **Published today** narrows to 1 (the single `event.published` row); switching preset correctly deactivates the previously-active preset; clicking the raw **Sent** quick-filter chip while **Failures today** is active re-derives **Sent today** as active (tuple match). No console errors.

---

## MGT-049: NotificationLogView required two or three interactions to reach the handful of views admins triage most

**Description**: `src/components/admin/NotificationLogView.tsx` shipped four client-side filter controls (status dropdown, type dropdown, free-text search per MGT-048, and a From/To date range) but the five views admins reach for most on delivery triage — "just the failures", "just what sent", "only publish notifications", "only timetable-update notifications", and "just today" — all required either two control interactions (e.g. scroll to the second filter row to type a date into both inputs) or a drill into a dropdown that was visually identical to every other filter. The underlying filter state (`statusFilter`, `typeFilter`, `dateFrom`, `dateTo`) and the `filteredEntries` `useMemo` already supported every one of those views correctly — the gap was purely that the fastest common paths were not surfaced as one-click affordances.

**Impact**: Low-friction but high-frequency UX gap on the notification triage flow. No correctness issue — every view was reachable through the existing controls — but the number of interactions per triage cycle was disproportionate to the small, stable set of views actually needed.

**Status**: Resolved — client-only change scoped to `src/components/admin/NotificationLogView.tsx`. A new chip row sits as the first child of the existing filter block (above the status / type / search row) and renders five toggle `<button>` chips in source order: **Failed**, **Sent**, **Published**, **Timetable updated**, **Today**. Each chip is a pure toggle over the existing state — clicking sets the target slice (`setStatusFilter('failed')`, `setStatusFilter('sent')`, `setTypeFilter('event.published')`, `setTypeFilter('timetable.updated')`, or `setDateFrom(todayIso) + setDateTo(todayIso)` where `todayIso = new Date().toISOString().slice(0, 10)`); clicking an already-active chip clears that slice back to empty string. Active state is expressed via `aria-pressed` and a muted variant of the existing status-pill palette (red for Failed, green for Sent, blue for the two type chips, gray for Today) with a small inline `chipClass(active, activeClasses)` helper. Chips respect the existing `controlsDisabled` flag so they are all disabled alongside the dropdowns during the initial load-all pass. No new state, no new filter logic, no new server action, no change to the filter pipeline, dropdowns, search input, date inputs, CSV export, Retry banner, cap warning, or row rendering — chips simply write into the already-declared state hooks. Empty-state copy at the existing `searchQuery || statusFilter || typeFilter || dateFrom || dateTo` conditional already handles chip-driven zero-match filters so no branch change was required. `npm run typecheck` clean, full vitest suite (62/62) passes, dev-server manual pass on `/admin/events/{id}` confirmed all nine verification steps: **Failed** narrows 3 → 0 with empty-state copy and `status` dropdown reading `failed`; **Failed** clicked again restores 3; **Sent** active = 3 rows (all sent); clicking **Failed** while **Sent** is active swaps (only one status chip active at a time by construction); **Sent + Published** intersects to 1 row; clicking **Timetable updated** swaps type off Published to Timetable, 2 rows; **Failed + Published** combination produces the zero-match empty-state; **Today** sets both date inputs to today and narrows correctly; **Today** clicked again clears both date inputs. No console errors.

---

## MGT-048: NotificationLogView had no free-text search — visual scanning was the only way to find a specific recipient, error, type, or status

**Description**: `src/components/admin/NotificationLogView.tsx` (shipped under MGT-047 as a deliberate slim mirror of `AuditLogView`) rendered status, type, and date-range filters but no free-text search input. Once a Notification history panel grew past a screenful of rows, admins triaging delivery had to visually scan the list for a recipient email fragment, a partial error string, a specific status, or a type-label substring — the sibling Audit log panel already shipped a proven `searchQuery` pattern, so the gap was purely the missing input.

**Impact**: Low-to-medium-friction operational gap on the notification triage flow. No correctness issue — every filter already present worked correctly and the CSV export was available as a fallback — but "find the row where recipient contains X" or "find the row whose error mentions Y" forced scroll-and-scan once the list grew.

**Status**: Resolved — client-only change scoped to `src/components/admin/NotificationLogView.tsx`. New `searchQuery` state is filtered case-insensitively across `recipient_email`, the human type label (`typeLabels[e.type] ?? e.type`, so the search agrees with what the UI shows), the raw `status` string (`sent` / `failed` / `queued`), and the nullable `error` string (null treated as empty). The `<input>` sits on filter Row 1 next to the existing status / type dropdowns, reusing AuditLogView's exact Tailwind classes (`text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 min-w-[140px] flex-1 max-w-xs`), placeholder `Search notifications...`, and aria-label `Search notification log`. Empty-state conditional extended to include `searchQuery`, so a search with zero matches reads "No entries match the current filters." `controlsDisabled` flag drives the input's `disabled` state during the initial load-all pass — same semantics as the sibling dropdowns. CSV export narrows to the filtered set automatically (no export-path change; `entriesToCsv(filteredEntries)` already did the right thing). No changes to `loadAllNotificationLog()`, `EventEditor` wiring, `[id]/page.tsx`, `AuditLogView`, `refreshSignal` / retry / cap-warning behaviour, schema, migrations, or RLS. `npm run typecheck` clean, full vitest suite (62/62) passes, dev-server manual pass on `/admin/events/{id}` confirmed: email substring narrows 3 → 1, type label `timetable` narrows 3 → 2, status `sent` resolves all 3 sent rows, zero-match search shows the combined empty-state copy, composition with the status dropdown correctly intersects, clear-search restores the full set, no console errors.

---

## MGT-047: notification_log rows were written correctly but had no read surface in the admin UI

**Description**: `sendEventNotification()` in `src/lib/resend/notifications.ts` writes a `notification_log` row on every attempted send (status `queued` / `sent` / `failed`, with `error` string and `recipient_email`). Rows were landing in the table correctly across all five call sites (preference-row-failure, Resend-not-configured, Resend-API-error, successful-send, and unexpected-exception paths), but nothing in the admin UI rendered them. Admins who sent a notification and wanted to confirm delivery — or diagnose a bounced / failed send — had no in-product way to do so and had to inspect the `notification_log` table directly in Supabase. The surrounding event editor already had an analogous **Audit log** panel rendering `audit_log` rows with a hardened load / error / retry pattern, so the gap was purely the missing sibling read surface — not a new pattern to design.

**Impact**: Medium-friction operational gap. No correctness issue — every notification_log row was persisted accurately — but delivery confirmation and failure triage required out-of-band database access, which slowed support and meant routine "did this actually send?" questions could not be answered from the admin UI. Zero customer-visible impact.

**Status**: Resolved — new read-only **Notification history** panel rendered below the audit log on `/admin/events/{id}`. Implemented as a direct mirror of the audit-log surface with the bespoke audit-only bits (filter dropdown, search, date range, CSV export, MetaDiff / TimetableDiff row expansions) stripped per the task constraint "no filters or pagination beyond basic reuse patterns". New server action `loadAllNotificationLog(eventId)` in `src/app/admin/events/actions.ts` (plus exported `NotificationLogEntry` type) follows the `loadAllAuditLog()` pattern verbatim — `requireEditor()` gate, 2000-row safety cap, Sentry sub-tag `loadAllNotificationLog.select`, generic user-facing error. `src/app/admin/events/[id]/page.tsx` fetches the initial page (25 rows + 1 for hasMore), captures query errors to Sentry under `tags: { action: 'eventEditorPage.listNotifications' }`, computes `notificationLoadError`, and threads `notificationLog` / `notificationHasMore` / `notificationLoadError` through into `EventEditor`. New client component `src/components/admin/NotificationLogView.tsx` reuses AuditLogView's collapsible header, loading indicator, inline Retry banner (MGT-030 / MGT-037 rescue pattern: seeds `allLoaded` from `!initialLoadError && !initialHasMore` and `loadError` from `initialLoadError`, so panel open auto-retries on failure), 2000-row cap warning, parent-driven `refreshSignal` reload, and divide-y row list — with row content redesigned for notification data: recipient email as primary line, type label + status pill as secondary, timestamp right-aligned, and a muted red inline error line beneath failed rows. `EventEditor` gains a `notificationRefreshSignal` counter incremented inside `performTimetableSave()` next to the existing `auditRefreshSignal` bump, scoped to the timetable-save path only since DEC-002 means metadata saves cannot produce a notification_log row. Desktop section-anchor nav at the top of the editor adds a **Notifications** jump link alongside Audit. No changes to `sendEventNotification()` or any notification writing path, no schema change, no migration, no RLS change. Full vitest suite passes, `tsc --noEmit` clean, `next build` succeeds.

---

## MGT-046: /api/auth/dev-session returned 500 — verifyOtp cannot redeem an admin-minted magic-link token through @supabase/ssr

**Description**: The dev-only auto-login route at `src/app/api/auth/dev-session/route.ts` called `admin.auth.admin.generateLink({ type: 'magiclink', email })` to mint a hashed token and then `supabase.auth.verifyOtp({ token_hash, type })` on an `@supabase/ssr` `createServerClient` to exchange it for a session. Every tested `(type, variant)` combination — `type: 'email'` + `token_hash`, `type: 'magiclink'` + `token_hash`, `type: 'email'` + `{ email, token: email_otp }`, `type: 'magiclink'` + `{ email, token: email_otp }` — returned a 500 from gotrue with either `"Email link is invalid or has expired"` or `"Token has expired or is invalid"`. Root cause: `@supabase/ssr`'s `createServerClient` hard-codes `auth.flowType: 'pkce'` (see `node_modules/@supabase/ssr/src/createServerClient.ts:190`, which applies `flowType: "pkce"` *after* the caller's `options?.auth` spread, so it cannot be overridden). Admin-minted magic-link tokens use the implicit flow and cannot be redeemed by a PKCE client — the gotrue verify endpoint rejects the exchange. A prior pass (2026-04-17) changed the verify `type` from `'magiclink'` to `'email'` on a mistaken SDK-typing diagnosis; both values sit on the `EmailOtpType` union and both were rejected at runtime for the same underlying reason (PKCE client, implicit-flow token).

**Impact**: Dev-only blast radius. The route is hard-gated on `NODE_ENV === 'development'` and returns 404 in all other environments, so no production or staging user was ever affected. Locally, the route was fully broken end-to-end — generateLink succeeded, the verify step always failed, no session cookies were ever written, Claude Preview could not auto-login, and the route could not be used by any local test harness.

**Status**: Resolved — `src/app/api/auth/dev-session/route.ts` rewritten to use the admin service-role client to set a single-shot random password on the `DEV_ADMIN_EMAIL` user via `admin.auth.admin.updateUserById(id, { password })`, then `supabase.auth.signInWithPassword({ email, password })` on the `createServerClient` cookie adapter. `signInWithPassword` is PKCE-compatible (no implicit-flow token to redeem), so the ssr cookie adapter captures the real `sb-*` session cookies, which are then attached to the `NextResponse.redirect('/admin')` response. The temp password has no lifetime beyond this request — every call resets it to a fresh `crypto.randomUUID()` value, so no stable credential is ever persisted. Generated link / verifyOtp path fully removed. `npm test` (62/62 passing), `npm run typecheck` (clean), `npm run build` succeeds. Manual dev-server verification: `GET /api/auth/dev-session` returns HTTP 307 to `/admin` with an `sb-*` auth-token cookie; a follow-up `GET /admin` returns 200 with `<h1>Events</h1>` (the authenticated admin dashboard) — not the access-denied fallback. See DEC-010 for the updated implementation note.

---

## MGT-045: Timetable review modal used an opt-in notify checkbox, making the save / notify decision ambiguous at submit time

**Description**: The `ReviewModal` footer for timetable saves on a **published** event previously rendered a single "Save" (or "Accept all & save") button plus an opt-in `<input type="checkbox" checked={notifyOnSave} …>` labelled "Notify attendees about changes" (`src/components/admin/EventEditor.tsx` `footerExtra` and the adjacent `notifyOnSave` `useState`). The checkbox was easy to miss, defaulted to unchecked, and did not force the admin to make a conscious notify / don't-notify decision at the exact moment of submission. The underlying server action (`saveDayEntries(eventId, entries, deletedIds, notify)` in `src/app/admin/events/actions.ts`) already accepted an explicit boolean — the ambiguity was purely UI-level.

**Impact**: Low-to-medium-friction UX gap on the timetable review flow. No correctness issue, but admins regularly save timetable changes on published events without consciously deciding whether attendees should be notified, leading to either unintended silent updates or missed notifications.

**Status**: Resolved — UI-only change in the timetable review footer. The checkbox is removed; two explicit primary actions take its place: **Save only** (outline secondary, dispatches the save path with `notify = false`) and **Save and notify** (primary solid, dispatches with `notify = true`). The two-button variant renders only when `notifyChoiceApplicable === true`, threaded by `EventEditor` as `reviewMode === 'timetable' && status === 'published' && !!notificationEmails.trim()`; in all other cases (metadata review, unpublished event, published event with no recipients) the footer continues to render today's single "Save" / "Accept all & save" button unchanged. `ReviewModal` callback signatures widened — `onAcceptAll(notify: boolean)`, `onConfirmSave(notify: boolean)`, `onAcceptAndSave(id: string, notify: boolean)` — and `EventEditor.performTimetableSave(rejAddedLocalIds, rejEditedIds, notify: boolean)` passes the flag through to `saveDayEntries()`. In-card last-card "Accept & save" and "Undo skip & save" shortcuts always dispatch with `notify = false` — the explicit notify decision is scoped to the footer per the task boundary. `notifyOnSave` state is deleted from `EventEditor`. The `footerExtra` slot still surfaces the "No notification email addresses set for this event." info line when the event is published without recipients. No server-action, `publishEvent`, `sendEventNotification`, `notification_log`, or publish-dialog UI changes. Metadata review flow unchanged. Full vitest suite (62 tests) passes, `tsc --noEmit` clean, `next build` succeeds.

---

## MGT-044: Public organisation page lived at `/o/{slug}`, not at the more-natural `/{slug}`, and organisation-slug creation had no reserved-slug or cross-table collision validation

**Description**: Pass B (DEC-019) shipped the public organisation page at `/o/{slug}` — a defensive prefix chosen to avoid collisions with existing per-event public URLs at `/{eventSlug}` and with a fixed set of top-level static routes (`/admin`, `/api`, `/auth`, `/privacy`, `/terms`, …). The `/o/` prefix worked but was not the natural canonical shape for a customer-facing URL (harder to share verbally, longer than necessary, asymmetric with the per-event URL shape). Additionally, `createOrganisation()` in `src/app/admin/orgs/actions.ts` only checked for collision against existing organisation slugs — it did not validate the slug against the reserved top-level path list (so a customer could in principle create an org with slug `admin` or `api` and the insert would succeed even though the resulting URL would never route), and it did not check for collision against existing event slugs (so an org slug could shadow a published event URL). Event-creation validation did not check against organisation slugs either, but that surface was left out of Pass C1 scope.

**Impact**: Medium-friction UX gap on the public-org URL (longer, less natural). High-latent risk on org creation — no reserved-path check meant the org list could in principle accumulate unroutable slugs, and no cross-table check meant a new org could shadow an existing event's public URL (and vice versa). Zero external reports of a real collision in practice; the defect was structural rather than observed.

**Status**: Resolved — Pass C1. The public organisation page now lives at `/{orgSlug}` at the top level. The legacy `/o/{orgSlug}` route is preserved as a 308 permanent redirect. `createOrganisation()` now enforces three slug-collision checks before insert: (1) reserved-slug check via a new shared `src/lib/constants/reserved-slugs.ts` module (covers `admin`, `api`, `auth`, `my`, `invites`, `notifications`, `privacy`, `terms`, `o`, `_next`, `favicon.ico`, `robots.txt`, `sitemap.xml`, `manifest.json`, `manifest.webmanifest`, `sitemap`, `robots`, `public`, `static`, `app`, `assets`) — returns `"That slug is reserved. Please choose a different one."`; (2) existing organisations.slug uniqueness probe — returns `"That slug is already taken."`; (3) new events.slug uniqueness probe (soft-deleted events intentionally included, since their slug rows remain recoverable) — also returns `"That slug is already taken."`. `src/app/(public)/[slug]/page.tsx` now falls through from event lookup to organisation lookup, rendering a new presentational component `src/components/public/PublicOrgView.tsx`; `src/app/(public)/o/[slug]/page.tsx` is replaced with a 308 redirect; `src/app/sitemap.ts` emits org URLs as `/{orgSlug}`; `src/app/admin/orgs/settings/PublicOrgUrlField.tsx` + `src/app/admin/orgs/settings/page.tsx` display the new URL shape and updated help copy. The symmetrical event-creation check (rejecting event slugs that collide with existing org slugs) is deliberately out of scope for Pass C1 and deferred to Pass C2, alongside the broader nested event URL design. No DB migration, no RLS change, no middleware change. Full vitest suite (62 tests) passes, `tsc --noEmit` clean, `next build` succeeds (DEC-022).

---

## MGT-043: MemberManager exposed four product-visible roles (owner / admin / editor / viewer), causing onboarding-time role confusion

**Description**: `MemberManager` (`src/components/admin/MemberManager.tsx`) previously rendered the full four-role matrix in both the member role dropdown (`const ROLES = ['owner', 'admin', 'editor', 'viewer']`) and the invite form (`const INVITE_ROLES = ['admin', 'editor', 'viewer']`). The semantic gap between `editor` and `admin` was narrow, and `viewer` was rarely used in practice — customers at invite time consistently asked what the difference between `editor` and `admin` actually was, slowing first-team-member onboarding. The full role matrix is still meaningful at the RLS / policy layer (and a small number of existing customer orgs still have member rows on the legacy roles), but exposing all four at the UI level added decision cost without a matching product benefit.

**Impact**: Medium-friction UX gap on the invite and role-change surfaces. No correctness issue — RLS, `updateMemberRole()`, `inviteMember()`, and `acceptInvite()` all behave correctly for any of the four roles.

**Status**: Resolved — UI-only simplification. `MemberManager` now exposes only `owner` and `admin` as product-visible selectable roles. Legacy `editor` / `viewer` rows remain visible on the member list via a disabled `<option value={member.role} disabled>{member.role} (legacy)</option>` so pre-existing memberships render their current role correctly and cannot be silently re-classified — but legacy roles are no longer newly assignable from the dropdown. The invite form no longer contains a role selector; new invites are sent with `role: 'admin'` at the `inviteMember()` call site and the form renders a static `admin` label in place of the previous select. `handleRoleChange()` additionally narrows `newRole` to `'owner' | 'admin'` and early-returns on any other value as a defence-in-depth guard against a legacy-option re-selection slipping through. No changes to `updateMemberRole()`, `inviteMember()`, `acceptInvite()`, `requireOwnerOrAdmin()`, `get_user_org_role()`, or any RLS policy — all four role strings remain accepted at the backend for full backward compatibility and no DB migration is required. Templates test fixture (`src/lib/resend/templates.test.ts`) `role` changed from `'editor'` to `'admin'` with its matching assertion updated, to reflect the new UI-driven invite role. Full vitest suite (62 tests) passes, `tsc --noEmit` clean, `next build` succeeds (DEC-020).

---

## MGT-041: First-org creators were dropped into /admin with no branding setup prompt

**Description**: `/admin/orgs/new` unconditionally redirected to `/admin` on success, regardless of whether the newly-created organisation was the user's first or their fifth. For first-run onboarding (zero-membership users routed in by `/auth/callback` per MGT-016), this meant the very first thing a brand-new owner saw after creating their org was the admin dashboard's event list — empty, with no guidance toward setting the org name, slug display, or branding. Subsequent-org creates behaved correctly (land on `/admin` and start using the new org immediately).

**Impact**: Medium-friction UX gap on the primary first-run onboarding path. New owners had to manually discover `/admin/orgs/settings` to upload a logo, set a primary colour, or customise header text before their public timetables would reflect their brand. Returning org-creators were unaffected.

**Status**: Resolved (Pass A) — `createOrganisation()` in `src/app/admin/orgs/actions.ts` now probes `org_members` for the current user via the authenticated Supabase client before inserting the new membership row, and threads a new `isFirstOrg: boolean` field through the `ActionResult<{ id: string; isFirstOrg: boolean }>` success payload. A failed probe is captured to Sentry with `tags: { action: 'createOrganisation.priorCount' }` and defaults to `isFirstOrg = false` so a transient read error never misroutes a returning user into the first-run path. `/admin/orgs/new` reads the new flag and routes `router.push(result.data.isFirstOrg ? '/admin/orgs/settings' : '/admin')`. All other creation behaviour — validation, slug-uniqueness probe, org + owner-membership inserts, cascade-delete rollback on membership-insert failure, outer/inner try/catch error handling (MGT-040), Sentry sub-tags, and error-message strings — is unchanged. No DB migration, no admin-client widening (the detection uses the authenticated client; `org_members_select` RLS already lets users see their own rows), and no changes to the subsequent-org flow.

---

## MGT-040: createOrganisation surfaced a false error when post-commit side effects threw

**Description**: `createOrganisation()` in `src/app/admin/orgs/actions.ts` ran two post-commit side effects — `setActiveOrgId(org.id)` (writes the active-org cookie via `cookies()`) and `revalidatePath('/admin')` — after the organisation and owner-membership inserts had already committed successfully. Neither call was wrapped in a try/catch. Any runtime exception at that point (cookie-store failure during a Next.js dynamic render, an internal failure inside `revalidatePath()`, or any other unexpected throw between the successful DB writes and the `return { success: true, data: { id: org.id } }` line) propagated out of the server action, either crashing the `/admin/orgs/new` route or flipping the user-facing result from success to error — even though the DB write had landed. The form then showed a generic error; the user, believing the action had failed, retried with the same slug and hit the "That slug is already taken." branch on the uniqueness probe, creating the appearance of a broken create-org flow. Additionally, no outer safety net existed around the whole function, so any unexpected exception outside the explicit error branches (e.g. thrown from `requireUser()` paths, the admin client constructor, or any other upstream helper) would crash the page rather than return a clean `ActionResult`.

**Impact**: Users saw a false "could not create organisation" error immediately after a successful create, with a second-attempt retry hitting the slug-collision branch. High-anxiety UX on the first-run onboarding path (MGT-016 routes zero-membership users here). Zero Sentry visibility for the underlying post-commit failure cause. The last documented false-error gap on the org creation flow.

**Status**: Resolved — `createOrganisation()` now wraps its entire body in an outer try/catch and additionally wraps the two post-commit side effects in an inner try/catch. The outer catch captures unexpected exceptions to Sentry with `tags: { action: 'createOrganisation' }` and returns a safe `ActionResult` (`"Could not create the organisation. Please retry."`) — mirrors the pattern already established in `inviteMember()` (MGT-025). The inner catch captures post-commit exceptions to Sentry with `tags: { action: 'createOrganisation.postCommit' }` and swallows them so the caller still sees `{ success: true, data: { id } }` when the DB write has committed. Post-commit failures (cookie-write, cache-revalidation) can no longer turn a successful org creation into a false-failure in the UI. Existing validation (name/slug trimming and length checks), slug-uniqueness probe, organisation insert, owner-membership insert, cascade-delete rollback on membership-insert failure, sub-tag Sentry captures at the insert sites (`createOrganisation.insertOrg`, `createOrganisation.insertMember`), error-message strings, and the `ActionResult<{ id: string }>` return shape are all unchanged. No client-behaviour changes — `/admin/orgs/new` continues to navigate on `{ success: true }` via its existing `router.push()`; no server-side redirect was introduced. Mirrors the outer-catch pattern already applied to `inviteMember()` and closes the last known false-error path on the org creation flow.

---

## MGT-039: Phase A platform access is a compatibility shortcut — no dedicated platform-admin UI yet

**Description**: Phase A of the access-permission plan shipped as a backend + RLS-only change (DEC-018). Platform staff (`users.platform_role IN ('staff','support')`) reach any customer org as an effective `'owner'` via a short-circuit in `get_user_org_role()` and an `OR is_platform_staff()` extension on the five org-scoped SELECT policies that bypass the helper. `getActiveOrg()` resolves a platform branch with `via: 'platform'`, and `audit_log.actor_context` records `{ via: 'platform', platform_role }` on every platform-reached mutation. However, several follow-on items are intentionally deferred to a later phase:

- No UI surface sets `users.platform_role` — the column is populated manually in the database (or by a future platform-admin tool).
- No UI surface shows the `audit_log.actor_context` field on the event editor audit-log panel; the column is populated on the write path but not yet rendered on the read path, so reviewers currently cannot tell platform-reached rows from membership-reached rows in the UI.
- No dedicated cross-org platform dashboard exists — platform staff still navigate via the standard `/admin` surface and the cookie-selected org.
- `get_user_org_role()` returns `'owner'` (the strongest role) for platform staff rather than a narrower per-action capability set. Any future need for narrower support-only permissions requires a policy-level refinement beyond the Phase A shortcut.
- `src/app/admin/orgs/actions.ts` still has zero `writeAuditLog()` coverage (pre-existing observability gap, documented at the end of MGT-037/MGT-038 and still deferred). Platform-reached org actions therefore do not yet produce `actor_context`-tagged audit rows — the gap is in the org-actions surface, not in the Phase A audit plumbing itself.

**Impact**: Platform staff can act on customer orgs immediately for support and recovery work — this is the intended Phase A outcome. The UI-side gaps mean (a) platform access provisioning currently requires a trusted database operator, (b) audit reviewers must inspect the `actor_context` column directly in Supabase (or via a future report) rather than seeing it in the admin UI, and (c) the `orgs/actions.ts` observability gap remains unchanged by Phase A. None of these are user-facing bugs; they are documented scope boundaries for the shortcut approach chosen in DEC-018.

**Status**: Deferred by design — Phase A scope is backend + RLS + audit-plumbing only. Phase B will introduce a dedicated platform-admin UI (provisioning, cross-org surfaces, narrower capabilities) and extend the admin audit-log viewer to render `actor_context`. The `orgs/actions.ts` audit-logging gap is tracked separately and remains the last documented observability gap in the admin server-action layer.

---

## MGT-038: EventEditorPage silently swallowed timetable_snapshots initial-query failures (no rescue path)

**Description**: After MGT-037 closed the audit_log initial-query silent-swallow on `src/app/admin/events/[id]/page.tsx`, the sibling `timetable_snapshots` query at lines 90–94 was explicitly deferred on the grounds that "MGT-032 rescues per-click views". Pass 20 exploration confirmed MGT-032 only rescues per-click `getSnapshotData()` calls inside `VersionHistory.handleView()` — with a failed initial-list load, `snapshotRows ?? []` collapses to `[]`, `versions` becomes `[]`, `<VersionHistory versions={[]} />` hits its early-return at `src/components/admin/VersionHistory.tsx:27-35` rendering `"No versions yet. A snapshot is saved each time you publish."`, and there are no row buttons rendered to click. The entire MGT-032 retry path is therefore unreachable. Users saw a fake-empty publish history with no retry affordance, and zero Sentry signal reached monitoring.

**Impact**: Failed initial snapshot-list loads on `/admin/events/{id}` presented as a fake "no versions yet" state with no banner, no error message, and no client-side rescue. Medium-impact UX gap for audit-adjacent surfaces (version history is how admins recover previous timetables). Zero Sentry visibility for the underlying cause. The last documented same-shape silent-swallow on the event editor page after MGT-036 / MGT-037.

**Status**: Resolved — `EventEditorPage` now additionally captures `snapshotsError` from the `timetable_snapshots` query, reports it to Sentry with `tags: { action: 'eventEditorPage.listSnapshots' }` (following the MGT-023 → MGT-037 sub-tag pattern), and computes a generic user-facing `versionsLoadError` string (`"Could not load version history. Please retry."`). A new optional `versionsLoadError` prop is threaded through `EventEditor`. `EventEditor` imports `ERROR_BANNER` from `@/lib/styles` (extending its existing import) and renders a section-scoped `ERROR_BANNER` (`role="alert"`) immediately above `<VersionHistory />` when the prop is set, so the user sees a clear signal that version history failed to load. No `VersionHistory` changes — its own `loadError` state (MGT-032) continues to rescue per-click view failures once the initial list recovers. Page reload is the retry path for the initial list, consistent with the MGT-033 / MGT-034 / MGT-035 server-component precedent. Mirrors the MGT-014 / MGT-019 / MGT-022 / MGT-030 / MGT-031 / MGT-032 / MGT-033 / MGT-034 / MGT-035 / MGT-036 / MGT-037 silent-swallow remediation chain and closes the last documented same-shape silent-swallow on the event editor page. Two siblings on the same page remain explicitly deferred: the `users` publisher-email query (LOW, purely cosmetic) and `orgs/actions.ts` zero `writeAuditLog()` coverage (observability gap, multi-action scope).

---

## MGT-037: EventEditorPage silently swallowed audit_log initial-query failures (no rescue path)

**Description**: After MGT-036 closed the days / entries silent-swallow cluster on `src/app/admin/events/[id]/page.tsx`, the sibling `audit_log` initial query at lines 138–143 was explicitly deferred on the grounds that "MGT-030 rescues the failure on panel open". Pass 19 exploration invalidated that assumption. `AuditLogView` (`src/components/admin/AuditLogView.tsx:249`) seeds `allLoaded` from `!initialHasMore`. When the server-side audit_log query fails, `auditRows` falls back to `[]`, so `auditHasMore` (computed as `allAuditRows.length > auditPageSize`) becomes `false`, which flips `allLoaded` to `true` at mount. The `useEffect` at :276 (`open && !allLoaded && !loadingAll`) therefore never fires, `loadAllAuditLog()` is never invoked, and MGT-030's retry/banner logic never runs. The user opens the panel, sees "No audit entries yet." (indistinguishable from a genuinely empty log), and has no retry path. Additionally, the initial query had zero Sentry capture, so every transient PG error, RLS regression, or schema drift on the audit-log load went invisible to monitoring.

**Impact**: Failed initial audit-log loads on `/admin/events/{id}` presented as a fake "empty audit trail" with no Retry banner, no error message, and no client-side rescue. High-impact UX gap for compliance-adjacent surfaces (change history is the core value of the audit log). Zero Sentry visibility for the underlying cause. The last documented HIGH-impact silent-swallow with no rescue path on the event editor page.

**Status**: Resolved — `EventEditorPage` now additionally captures `auditError` from the audit_log query, reports it to Sentry with `tags: { action: 'eventEditorPage.listAudit' }` (following the MGT-023 → MGT-036 sub-tag pattern), and computes a generic user-facing `auditLoadError` string (`"Could not load audit log. Please retry."`). A new optional `auditLoadError` prop is threaded through `EventEditor` and passed to `AuditLogView` as `initialLoadError`. `AuditLogView` seeds its existing `loadError` state from `initialLoadError ?? null` (so the Retry banner at lines 413–427 renders immediately on panel open) and seeds `allLoaded` from `!initialLoadError && !initialHasMore` (so the existing `useEffect` naturally fires `loadAll()` on panel open as a retry path — either clearing the banner on success or replacing it with the latest hardened message on continued failure). No new dependencies, no new banner UI, no test-surface changes; the existing Retry button logic is reused verbatim. Three siblings on the same page remain — `timetable_snapshots` (MEDIUM, same shape, MGT-032 only rescues per-click views so the initial-list failure has no rescue; queued as MGT-038), `users` for publisher emails (LOW, purely cosmetic), and `orgs/actions.ts` zero `writeAuditLog()` coverage (observability gap, multi-action scope) — all explicitly deferred.

---

## MGT-036: EventEditorPage silently swallowed days / entries query failures

**Description**: `EventEditorPage` (`src/app/admin/events/[id]/page.tsx`) is a pure server component that issues five distinct Supabase queries after the top-level event lookup: `event_days` (days list), `timetable_entries` (entries list), `timetable_snapshots` (version history), `users` (snapshot publisher emails), and `audit_log` (audit trail). All five previously destructured only `{ data }` and dropped the `error` field — on failure each fell back to an empty array with no Sentry capture and no UI signal. The two highest-impact queries were the days and entries loads: a silent failure on either left `EventEditor` hydrated with `dayList = []` / `entries = []`, so the timetable editor rendered as if the event had zero days or a wiped timetable. Since `createEvent()` always inserts at least one day, an "empty" event editor is a strong anomaly, not a legitimate state — yet users had no way to tell apart a transient PG error, RLS regression, or schema drift from a real data wipe. This was explicitly called out at the end of MGT-034 and MGT-035 as the last remaining HIGH-impact silent-swallow cluster in the admin surface, with five queries in one file and no top-level banner.

**Impact**: Failed days or entries loads on `/admin/events/{id}` presented as an apparently empty or wiped event editor. Highest-anxiety UX of any remaining admin silent-swallow (loss-of-work signal with no retry affordance), zero Sentry visibility for the underlying cause.

**Status**: Resolved — `EventEditorPage` now additionally captures `daysError` and `entriesError` from the two critical queries. Each failure is captured to Sentry with a distinct `action` sub-tag (`eventEditorPage.listDays`, `eventEditorPage.listEntries`) following the MGT-023 → MGT-029 sub-tag pattern. A combined `loadError` string is computed (`"Could not load this event. Please retry."` when both fail, single-line variants when only one fails) and rendered as an inline `ERROR_BANNER` (`role="alert"`) immediately below the breadcrumb and above `<EventEditor …/>`. `ERROR_BANNER` is added to the existing `@/lib/styles` import; `Sentry` is added as a new `@sentry/nextjs` namespace import. The existing `?? []` fallbacks for `days` / `entries` are unchanged — `EventEditor` still hydrates on the error path so the header, breadcrumb, event metadata, and action bar remain usable; a page reload re-executes the queries. No control-flow, rendering, or component-signature changes beyond the banner and Sentry captures; stays a pure server component. Mirrors the MGT-014 / MGT-019 / MGT-022 / MGT-030 / MGT-031 / MGT-032 / MGT-033 / MGT-034 / MGT-035 silent-swallow remediation chain and closes the last documented HIGH-impact silent-swallow in the admin surface. Three siblings on the same page — `timetable_snapshots` (MEDIUM, MGT-032 rescues per-view reads), `users` for publisher emails (LOW, purely cosmetic), and `audit_log` (MEDIUM, MGT-030 rescues on panel open) — are explicitly deferred to a future narrow pass; their rescue paths already mitigate user visibility, and touching them would broaden scope beyond the safest subset. `orgs/actions.ts` zero `writeAuditLog()` coverage remains an observability gap (not a user-facing bug) and is also deferred.

---

## MGT-035: OrgSettingsPage silently swallowed listOrgMembers / listOrgInvites failures

**Description**: `OrgSettingsPage` (`src/app/admin/orgs/settings/page.tsx`) is a pure server component that calls the already-hardened `listOrgMembers()` and `listOrgInvites()` server actions (MGT-025: generic message + Sentry capture with `tags: { action: 'listOrgMembers.select' | 'listOrgInvites.select' }`) in parallel, then collapsed both results with `const initialMembers = membersResult.success ? membersResult.data : []` and the matching invites line. On any failure of either action, the `error` field was dropped entirely, `MemberManager` hydrated with empty arrays on first paint, and the L11 empty-state copy ("No members yet." / "No pending invites.") rendered as if the org were genuinely empty. `MemberManager`'s own first-mount `useEffect` refetch is guarded by `isMounted` (see `MemberManager.tsx:66-74`) so there was no client-side rescue. Most dangerously: an owner viewing their own settings page saw "no members" — impossible in a healthy state (every org always has at least the viewing owner), so a transient PG error, RLS regression, or schema drift looked like a catastrophic team-roster wipe with no retry path other than a full page reload. Called out at the end of MGT-034 as the next deferred sibling and ranked top priority for Pass 17.

**Impact**: Failed members/invites loads on `/admin/orgs/settings` presented as a fake empty team roster. High-anxiety UX for owners (apparent lockout or team wipe), zero UI feedback, zero retry affordance. Raw Postgres dialect reachability was already closed by MGT-025, but the silent-empty-state remediation gap remained.

**Status**: Resolved — `OrgSettingsPage` now additionally captures `membersError` and `invitesError` from the two hardened server actions and computes a combined `loadError` string (single-message fallthrough when only one fails, `·`-joined when both fail). `ERROR_BANNER` is added to the existing `@/lib/styles` import and a new inline `ERROR_BANNER` (`role="alert"`) renders inside the **Members & invites** section immediately above `<MemberManager …/>` whenever `loadError` is non-null. The banner is intentionally scoped to the affected section rather than the top of the page — the org name / slug / branding sections above it loaded successfully from the `organisations` table and remain fully functional. The existing `[]` fallbacks for `initialMembers` / `initialInvites` are unchanged; `MemberManager` continues to hydrate and its internal `loadData()` on mutation remains the live retry path once the transient failure clears. No Sentry capture at the page layer — `listOrgMembers.select` and `listOrgInvites.select` already capture at the server-action layer (MGT-025). No client-side refactor, no retry button, no redirect; a page reload re-executes the server actions, consistent with the MGT-033 precedent. Mirrors the MGT-014 / MGT-019 / MGT-022 / MGT-030 / MGT-031 / MGT-032 / MGT-033 / MGT-034 silent-swallow remediation chain and closes the last documented server-component silent-swallow in the admin surface. The `EventEditorPage` (`src/app/admin/events/[id]/page.tsx`) five-query silent-swallow cluster (days, entries, snapshots, publisher emails, audit rows) remains the last deferred candidate — HIGH impact but multi-query refactor scope, explicitly out of scope for Pass 17. `orgs/actions.ts` zero `writeAuditLog()` coverage remains an observability gap (not a user-facing bug) and is also deferred.

---

## MGT-001: publishEvent() auto-sends notifications

**Description**: `publishEvent()` in `src/app/admin/events/actions.ts` unconditionally calls `sendEventNotification()` on publish. There is no opt-in checkbox or confirmation — unlike the save flow, which correctly uses an opt-in checkbox in the review modal.

**Impact**: Users may unintentionally send notifications to all configured recipients every time they publish or republish an event.

**Status**: Resolved — `publishEvent()` now accepts a `notify` parameter (default `false`). Publish dialog includes an opt-in checkbox, matching the save flow pattern.

---

## MGT-002: No error boundaries

**Description**: No `error.tsx` files exist anywhere in the app. Unhandled errors in any route will result in a white screen or Next.js default error page.

**Impact**: Poor user experience on any runtime error. No graceful recovery or actionable feedback.

**Status**: Resolved — error boundaries added at root (`global-error.tsx`, `error.tsx`), `(public)/error.tsx`, `admin/error.tsx`, and `my/error.tsx`. All routes now have styled error recovery UI.

---

## MGT-003: No production monitoring

**Description**: Error tracking is limited to in-database `notification_log` and console output via `src/lib/debug.ts`. No external monitoring service (Sentry, Datadog, etc.) is configured.

**Impact**: Production errors may go undetected. No alerting, no dashboards, no error aggregation.

**Status**: Resolved — Sentry integrated via `@sentry/nextjs`. Client, server, and edge runtimes covered. All 5 error boundaries capture to Sentry. Key server-side catch blocks in `events/actions.ts`, `orgs/actions.ts`, and `notifications.ts` report to Sentry. Conservative 10% trace sampling.

---

## MGT-004: No test framework

**Description**: No testing framework is configured. No unit, integration, or end-to-end tests exist. All testing is manual.

**Impact**: Regressions can ship undetected. Refactoring is high-risk without automated coverage.

**Status**: Resolved — Vitest configured with 57 smoke tests covering pure utility functions (app-url, slug, time, resend client, email templates including unsubscribe links, env validation). Run via `npm test`.

---

## MGT-005: Notification debounce edge cases

**Description**: The 10-minute per-recipient per-event debounce in `src/lib/resend/notifications.ts` prevents duplicate sends, but edge cases exist:
- Rapid publish → unpublish → republish within 10 minutes: second publish notification is silently dropped
- Failed sends (`status: 'failed'`) do NOT block retry — the debounce only checks `status = 'sent'`, so a failed send can be retried immediately by re-triggering the action
- No admin UI to view failed notifications or manually retry them

**Impact**: Recipients may miss legitimate notifications in rapid-action scenarios. Failed sends are retryable but only by repeating the triggering action (publish/save), not through a dedicated retry mechanism.

**Status**: Verified — all five edge cases confirmed against code (2026-04-13):
1. Debounce works as intended (10-min per-recipient per-event, checks `status = 'sent'` only)
2. Failed sends do not block retry (debounce ignores `status = 'failed'`)
3. Explicit opt-in required for both publish and save notifications
4. Unpublish does not trigger notifications
5. Rapid publish/unpublish/republish: second publish notification silently dropped within 10-min window — acceptable by design (DEC-004)

Remaining gap: no admin UI to view failed notifications or manually retry them.

---

## MGT-007: Invite URL uses hardcoded production fallback

**Description**: `inviteMember()` in `src/app/admin/orgs/actions.ts` built the invite accept URL using `process.env.NEXT_PUBLIC_APP_URL ?? 'https://mygridtime.com'` instead of the canonical `getServerAppUrl()` helper. This meant invite emails in non-production environments (local dev, preview deploys) contained the wrong URL.

**Impact**: Invite links in development/preview environments pointed to production instead of the current environment.

**Status**: Resolved — replaced hardcoded URL logic with `getServerAppUrl()`, which respects the full env priority chain (APP_URL → NEXT_PUBLIC_APP_URL → URL → NEXT_PUBLIC_SITE_URL → localhost).

---

## MGT-006: Debug logging enabled by default

**Description**: `DEBUG_NOTIFICATIONS` in `src/lib/debug.ts` was hardcoded to `true`. This output verbose notification tracing to the console in all environments.

**Impact**: Potential information leakage in production logs. Noise in log output.

**Status**: Resolved — `DEBUG_NOTIFICATIONS` is now driven by the `DEBUG_NOTIFICATIONS` env var (defaults to `false`). Set to `"true"` in `.env.local` for local debugging only.

---

## MGT-008: No admin UI for unsubscribe visibility

**Description**: The `notification_preferences` table tracks per-email unsubscribe state, but there is no admin interface to view which recipients have unsubscribed. Admins cannot see unsubscribe status or re-subscribe recipients on their behalf.

**Impact**: Admins have no visibility into why specific recipients stop receiving emails. Debugging requires direct database queries.

**Status**: Resolved — admin event editor now shows a read-only amber info block listing unsubscribed recipients next to the notification emails field. No admin override capability — visibility only.

---

## MGT-009: Event mutations did not revalidate cached routes

**Description**: Server actions in `src/app/admin/events/actions.ts` (`createEvent`, `updateEventMetadata`, `publishEvent`, `unpublishEvent`, `archiveEvent`, `duplicateEvent`, `addEventDay`, `removeEventDay`, `updateDayLabel`, `saveDayEntries`) mutated the database but never called `revalidatePath()`. Admin list, admin event editor, and public `/{slug}` routes could show stale data until a manual refresh or unrelated navigation cleared the Next.js fetch cache.

**Impact**: After publishing, editing, or saving a timetable, admins and public viewers could see stale content. Confusing UX and potential support noise.

**Status**: Resolved — all event mutation actions now call `revalidatePath()` on success. Admin paths (`/admin/events` and the dynamic `/admin/events/[id]`) are always revalidated; actions that affect published content also revalidate the public dynamic routes (`/[slug]`, `/[slug]/print`), `/my`, and `/`. Day-level actions that only receive a `dayId` use the dynamic-route form (`'/admin/events/[id]'`, `'page'`) so they don't need to re-fetch the parent event id.

---

## MGT-010: writeAuditLog() could crash the calling action

**Description**: `writeAuditLog()` in `src/lib/audit.ts` previously fired `supabase.from('audit_log').insert(...)` without catching errors. A Supabase error row was silently ignored, but any thrown exception (network error, Sentry hook, etc.) would bubble up and flip the primary mutation's result from success to failure even though the real database write had already committed.

**Impact**: Audit logging — a side-effect — could cause spurious action failures, confusing admins and breaking flows that already succeeded in the DB.

**Status**: Resolved — `writeAuditLog()` is now wrapped in a try/catch, inspects the Supabase `{error}` result, and reports any failure to Sentry with a `helper: 'writeAuditLog'` tag. It never throws and never returns a non-void signal to the caller, so the primary mutation remains the single source of success/failure.

---

## MGT-011: Silent partial failures in duplicate/template/save flows

**Description**: Three server actions treated failed child-row inserts as non-fatal:

- `duplicateEvent()` — failed `event_days` inserts were skipped with `continue`; failed `timetable_entries` inserts had no error check at all. A partially-populated event could be returned as `{ success: true }`.
- `createEventFromTemplate()` — same pattern. A partial event could be returned as success.
- `saveDayEntries()` — failed inserts of new entries were silently ignored (only `savedIds` was left `null`). Audit logging and notifications then ran as if the save had fully succeeded.

**Impact**: Admins could see a "success" result for a duplicate/template/save that silently lost days or entries. Notifications could fire for saves that were only partially applied.

**Status**: Resolved —

- `duplicateEvent()` now tracks a `failureReason` for day and entry insert errors, rolls back the new event with `supabase.from('events').delete().eq('id', newEvent.id)` (cascade removes already-inserted children), reports to Sentry, and returns `{ success: false, error }`.
- `createEventFromTemplate()` uses the same rollback pattern.
- `saveDayEntries()` collects insert failures into an `insertFailures` array. If any failed, it reports to Sentry and returns an error *before* running the audit-log write and notification send — so the caller sees the failure and no notifications fire for a partial save. Deletes and updates applied earlier in the same call are left in place (no transaction), and the error message tells the caller to retry.

---

## MGT-012: "Save details" button not disabled while metadata save in flight

**Description**: The `EventEditor` "Save details" button (`src/components/admin/EventEditor.tsx`) stayed enabled while a metadata save was in progress. Rapid clicks or re-submissions could fire concurrent `updateEventMetadata()` calls. The direct-save path (no review cards) never touched `reviewSaving`, so even the modal-driven pending treatment did not apply there.

**Impact**: Possible duplicate server-action invocations, wasted round-trips, race conditions around `savedMeta` / `router.refresh()`, and an unclear button state for the user.

**Status**: Resolved — the button is disabled and shows "Saving…" whenever `reviewSaving && reviewMode === 'metadata'`. `handleSaveMetadata()` now returns immediately if `reviewSaving` is already true (concurrent-submission guard) and wraps the direct-save path in `setReviewSaving(true)` / `finally setReviewSaving(false)` so both paths gate the button identically.

---

## MGT-013: Role changes applied instantly on select change

**Description**: `MemberManager` committed a role change the moment the `<select>` fired `onChange`. An accidental click / arrow-key scroll could downgrade or promote a member with no confirmation, and no way to recover other than re-selecting the original role.

**Impact**: High-blast-radius accidental role changes, especially downgrades that silently revoked permissions.

**Status**: Resolved — role changes now route through the existing `ConfirmDialog`. Cancel relies on the controlled select (`value={member.role}`) to snap back to the unchanged role on re-render. The dialog uses a downgrade-aware description (explicit "they will immediately lose any permissions not granted to the {newRole} role" wording) plus destructive styling for downgrades. No audit-notes / undo surface added — scope kept tight.

---

## MGT-014: MemberManager refetch failures hidden from the user

**Description**: `MemberManager.loadData()` caught all errors and silently returned, so a failing `listOrgMembers()` / `listOrgInvites()` after an invite, removal, role change, or revoke would leave the UI showing stale data with a success banner. The initial `useEffect` refetch had the same problem on org-switch.

**Impact**: Users could see "Member removed." / "Role updated." while the on-screen list never reflected the change, causing confusion or repeated attempts on already-completed actions.

**Status**: Resolved — `loadData()` now returns `{ success: true } | { success: false, error }`. Every call site (invite / remove / role-change / revoke / `useEffect` refetch) inspects the result and surfaces an inline error message on failure. The error wording is explicit that the primary action *did* succeed but the refresh did not (e.g. "Member removed, but the member list could not be refreshed: …"), so we never fake success.

---

## MGT-016: New users with no orgs landed on an unhelpful page

**Description**: `/auth/callback` mapped any user without an elevated role to `/` (public landing). Two distinct populations were conflated: users with viewer-only memberships, and users with **zero** memberships. A brand-new signed-in user with no orgs was dropped onto the public marketing page with no path forward — they could not reach `/admin/orgs/new` because the admin layout showed "Access denied" for anyone without an active org.

**Impact**: First-run dead end. New sign-ups had no visible next step without manual admin intervention.

**Status**: Resolved — `/auth/callback` now distinguishes the two cases: zero memberships → `/admin/orgs/new`; viewer-only memberships → `/my` (consumer dashboard). The admin layout reads an `x-pathname` header (set in `middleware.ts`) and permits `/admin/orgs/new` through the guard when the user has zero memberships, so the onboarding page is actually reachable. When a zero-membership user lands on `/admin`, the access-denied state is replaced with a "Welcome to MyGridTime — create your first organisation" CTA that links straight to the form.

---

## MGT-017: Invite acceptance redirect had no manual fallback

**Description**: `AcceptInviteForm` called `router.push()` inside a `setTimeout` after a successful `acceptInvite()`. If the client-side navigation did not land cleanly (blocked navigation, slow route transition, transient client error), the user was stranded on the success screen with no way to continue — no visible link, only the auto-redirect that had already fired once.

**Impact**: Low-probability but high-friction dead end immediately after a successful account action.

**Status**: Resolved — the success state now renders a manual "Continue to admin" / "Continue to your timetables" link alongside the redirecting message. Auto-redirect behaviour is unchanged (same 1.5s `setTimeout`); the link is additive. The destination is stored in component state so the manual link always points to the same target as the auto-redirect (`/my` for viewers, `/admin` for elevated roles).

---

## MGT-018: getDatesInRange silently truncated ranges over 14 days

**Description**: `getDatesInRange()` in `src/lib/utils/slug.ts` hard-capped its loop at 14 iterations. Any caller that passed a longer range (createEvent, createEventFromTemplate, duplicateEvent) silently got a truncated list and built an event with fewer days than the user-supplied range — no error, no warning. The unit test at `slug.test.ts` even documented the cap as intended behaviour.

**Impact**: User picks a 20-day range → event is created with 14 days of content and 6 missing dates, with no feedback. Data loss masquerading as success.

**Status**: Resolved —
- Exported `MAX_EVENT_DAYS = 14` and a new `countDaysInRange()` helper from `slug.ts`.
- `getDatesInRange()` no longer caps at 14; it now has a 366-day safety bound purely to defend against pathological inputs, and its contract explicitly requires callers to pre-validate.
- `createEvent()` (events/actions.ts), `createEventFromTemplate()` (templates/actions.ts), and `duplicateEvent()` (events/actions.ts) all now call `countDaysInRange()` up front and return `{ success: false, error: "Events are limited to 14 days…" }` if the range is too long, or `"End date must be on or after the start date."` if reversed. The error bubbles through `handleSubmit` in the new-event form and the duplicate modal and is rendered inline on the existing error banners — no UI changes needed.
- The 14-day product limit itself is unchanged (per DEC-016).
- `slug.test.ts` updated: the "caps at 14 days" test is replaced with assertions that `getDatesInRange` now returns the full range, plus new coverage for `countDaysInRange` and `MAX_EVENT_DAYS`.

---

## MGT-019: Day-label edit errors swallowed by TimetableBuilder

**Description**: `handleSaveLabel()` in `src/components/admin/TimetableBuilder.tsx` awaited `updateDayLabel()` without inspecting its result, then unconditionally updated local state and exited edit mode. A server-side failure (RLS denial, network blip, validation error) produced an optimistic local update that did not match the database, and the tab returned to its normal "saved" appearance.

**Impact**: Silent desync between UI and DB on any failed label save. User believed the rename landed; on refresh it reverted.

**Status**: Resolved — `handleSaveLabel()` now inspects `result.success`. On failure it shows the returned error inline in a red banner under the tab row, keeps the tab in edit mode so the draft is preserved, and offers a Cancel action that clears the draft and the error. On success it behaves exactly as before. A concurrent-save guard (`savingLabel` flag) prevents blur + Enter from double-firing the action. Esc still exits edit mode and clears the error.

---

## MGT-020: Notification preference upsert failures were swallowed

**Description**: `sendEventNotification()` in `src/lib/resend/notifications.ts` looped over recipients and called `admin.from('notification_preferences').upsert(...)` without checking the result. A failed upsert (RLS issue, PG error, network fault) meant no preference row was created, the subsequent pref fetch returned no row for that recipient, `pref?.token` was undefined, and the email was sent **without** an unsubscribe link. The List-Unsubscribe header was also omitted for that recipient. The failure was entirely invisible to Sentry and to `notification_log`.

**Impact**: Potentially non-compliant sends (no working unsubscribe link) with zero visibility. Debugging required direct DB comparison of `notification_preferences` against `notification_emails`.

**Status**: Resolved —
- Every preference-row upsert now captures `{ error }`. Failures are reported to Sentry with `tags: { action: 'sendEventNotification.preferenceUpsert' }` and the failing email is tracked in a local `upsertFailedEmails` set.
- The follow-up preference fetch now also captures and reports its own error to Sentry (`action: 'sendEventNotification.preferenceFetch'`).
- If a recipient has no preference row in `prefMap` at send time (because the upsert failed or the row was never readable), the helper **refuses to send** to that recipient. It writes a `notification_log` row with `status: 'failed'` and a reason string — either "Preference row upsert failed — unsubscribe link unavailable." or "Preference row missing after upsert — unsubscribe link unavailable." — and moves on to the next recipient.
- The rest of the send flow is unaffected: recipients whose preference rows succeeded still receive their emails with working unsubscribe links.

---

## MGT-021: Templates server actions did not revalidate cached routes

**Description**: `saveAsTemplate()`, `deleteTemplate()`, and `createEventFromTemplate()` in `src/app/admin/templates/actions.ts` mutated the database but never called `revalidatePath()`. Same class of bug as MGT-009 (resolved for events) and never applied to templates. Result: after saving a template from the event editor, `/admin/templates` would still show the old list until a hard reload. Deleting a template from another tab left the row visible elsewhere. Creating an event from a template left the new event missing from `/admin/events` until a manual refresh.

**Impact**: Stale cache on every template list. Confusing UX, especially across tabs and after the create-from-template flow.

**Status**: Resolved — added a local `revalidateTemplatePaths()` helper that invalidates `/admin/templates` and `/admin/events/new` (which reads `listTemplates()` for `TemplatePicker`). All three template-mutating actions now call it on the success path. `createEventFromTemplate()` additionally revalidates `/admin/events`, mirroring how `createEvent()` handles its admin-side cache. Public dynamic routes are intentionally not revalidated — the new event is a draft.

---

## MGT-022: TemplateActions silently swallowed delete failures

**Description**: `TemplateActions.handleDelete()` in `src/app/admin/templates/TemplateActions.tsx` awaited `deleteTemplate()` but ignored `result.success`. On failure the dialog closed and the deleting state cleared — the user saw nothing, the row stayed in local state by accident (the optimistic `filter` was guarded by `success`), and on the next refresh the row reappeared. Same silent-success pattern MGT-014 fixed in `MemberManager`.

**Impact**: Failed template deletes presented as silent success. User believed the row was gone; it reappeared on refresh.

**Status**: Resolved — added a `deleteError` state. On failure `handleDelete()` keeps the dialog open, surfaces the error inline (red text inside the `ConfirmDialog`), and does not mutate local template state. A `handleCancelDelete()` helper clears both the dialog and the error on cancel. No new dependencies; mirrors the MGT-014 pattern.

---

## MGT-023: removeEventDay() swallowed the entries-delete error

**Description**: `removeEventDay()` in `src/app/admin/events/actions.ts` explicitly deleted child `timetable_entries` rows before deleting the parent `event_days` row ("RLS may require explicit delete"), but it never captured `{ error }` on that first delete. If the entries delete failed (RLS regression, network blip, transient PG error), execution fell through to the `event_days` delete — which would then either fail with a raw FK-violation `error.message` leaked straight to the UI, or succeed via cascade and orphan the data the explicit-delete branch was meant to clean up. Either branch was silent or confusing.

**Impact**: Possible orphan rows or a raw Postgres error string surfaced to the user on day removal. No Sentry signal for the underlying RLS / transport failure.

**Status**: Resolved — `removeEventDay()` now captures `{ error: entriesError }` on the `timetable_entries` delete and, on failure, reports to Sentry with `tags: { action: 'removeEventDay.deleteEntries' }` and returns a clean generic message (`"Could not remove this day. Please retry."`) **before** attempting the parent delete. The `event_days` delete failure path now uses the same generic message and reports to Sentry with `tags: { action: 'removeEventDay.deleteDay' }`. Success-path revalidation (`/admin/events/[id]`, `/[slug]`) is unchanged. `TimetableBuilder.handleRemoveDay()` already surfaces `result.error` through its existing inline error UI, so no caller changes were needed.

---

## MGT-024: addEventDay() and updateDayLabel() leaked raw Postgres errors

**Description**: After Pass 5 hardened `removeEventDay()`, the two sibling day-level actions in `src/app/admin/events/actions.ts` were still pre-Pass-5. `addEventDay()` returned `error?.message ?? 'Failed to add day'` and `updateDayLabel()` returned `error.message` on failure. Both return values were rendered verbatim in `TimetableBuilder` — `handleAddDay()` piped it into the add-day dialog error state, and `handleSaveLabel()` interpolated it into the inline red banner under the day tabs. Any RLS denial, FK violation, check-constraint failure, or transient PG error surfaced raw Postgres dialect to the admin user, with no Sentry signal. Separately, `addEventDay()` only called `revalidateAdminEventPaths(eventId)` on the success path — it did not call `revalidatePublicEventPaths()`, so adding a day to an already-published event left `/{slug}`, `/{slug}/print`, `/my`, and `/` with a stale day count until another mutation or manual refresh.

**Impact**: Raw Postgres errors visible to admins on add-day and day-label-save failures; no Sentry visibility for the underlying causes; stale public caches after adding a day to a published event.

**Status**: Resolved —
- `addEventDay()` now captures the Supabase insert error to Sentry with `tags: { action: 'addEventDay.insert' }` (and the no-row branch with `addEventDay.insertNoData`) and returns a single generic user-facing message (`"Could not add this day. Please retry."`). Success path now calls both `revalidateAdminEventPaths(eventId)` and `revalidatePublicEventPaths()` so the public timetable stays in sync after a day is added to a published event.
- `updateDayLabel()` now captures the Supabase update error to Sentry with `tags: { action: 'updateDayLabel.update' }` and returns a generic user-facing message (`"Could not save this day label. Please retry."`). Success-path revalidation is unchanged.
- Mirrors the MGT-023 pattern already applied to `removeEventDay()`; the three sibling day actions are now consistent. No client changes needed — `TimetableBuilder.handleAddDay()` and `handleSaveLabel()` already surface `result.error` through their existing inline error UIs.

---

## MGT-025: orgs/actions.ts leaked raw Postgres errors across the org admin surface

**Description**: After Passes 5 and 6 brought `events/actions.ts` day-level actions up to a consistent "Sentry + generic message" error pattern, `src/app/admin/orgs/actions.ts` was still pre-hardening. Eleven failure paths across nine server actions returned raw Supabase `error.message` strings directly to the admin UI, with zero Sentry captures on any of them:

- `createOrganisation()` — org insert and owner membership insert (post-rollback)
- `updateOrganisation()` — org name update
- `updateOrgBranding()` — branding update
- `listOrgMembers()` — admin member list fetch
- `updateMemberRole()` — role change
- `removeMember()` — member delete
- `listOrgInvites()` — pending invite fetch
- `inviteMember()` — non-23505 invite insert errors and the outer catch block
- `revokeInvite()` — invite delete
- `acceptInvite()` — new-member insert path

Any RLS regression, FK violation, or transient PG error on these paths surfaced raw Postgres dialect to the admin user with no monitoring signal. This was the last remaining systemic pre-hardening gap in the admin server-action layer.

**Impact**: Raw Postgres errors visible to admins across the entire org management surface (create org, update org, branding, member roles, member removal, invite send/list/revoke, invite acceptance). No Sentry visibility for the underlying causes. Error wording varied wildly across failure modes, hurting both UX and debuggability.

**Status**: Resolved — all eleven failure paths now follow the MGT-023/024 pattern. Each Supabase error is captured to Sentry with a distinct action tag (`createOrganisation.insertOrg`, `createOrganisation.insertMember`, `updateOrganisation.update`, `updateOrgBranding.update`, `listOrgMembers.select`, `updateMemberRole.update`, `removeMember.delete`, `listOrgInvites.select`, `inviteMember.insertInvite`, `revokeInvite.delete`, `acceptInvite.insertMember`) and returns a single clean generic user-facing message. The outer `inviteMember()` catch block no longer leaks `err.message`; its existing `Sentry.captureException` call with `action: 'inviteMember'` remains intact. No control-flow, revalidation, or signature changes. Client components (`MemberManager`, `OrgSettingsForm`, `BrandingEditor`, `InviteForm`, `AcceptInviteForm`) already surface `result.error` through existing inline UIs — no caller changes needed. A final `grep` across the file confirms zero `error.message` values reachable from any `return` statement.

---

## MGT-027: templates/actions.ts mutating actions leaked raw Postgres errors

**Description**: After Pass 8 closed the event-lifecycle raw-error leaks in `events/actions.ts` (MGT-026), the companion admin file `src/app/admin/templates/actions.ts` was explicitly deferred. Six failure paths across three user-facing mutating server actions still returned raw Supabase `error.message` (or interpolated it into a string) with no Sentry capture at the point of failure:

- `saveAsTemplate()` — template insert (`error?.message ?? 'Failed to save template.'`)
- `deleteTemplate()` — template delete (`error.message`)
- `createEventFromTemplate()` — event insert (`eventErr?.message ?? 'Failed to create event.'`)
- `createEventFromTemplate()` — day insert inside the loop (embedded `dayErr?.message` into a `failureReason` string)
- `createEventFromTemplate()` — entries insert inside the loop (embedded `entriesErr.message` into `failureReason`)
- `createEventFromTemplate()` — rollback return (`Failed to create event from template: ${failureReason}`) leaked the embedded raw Postgres text verbatim; its single outer `Sentry.captureException` wrapped a synthetic `Error` built from the same raw message, losing the original stack trace and conflating day vs entry vs event failure modes under one tag.

Any RLS regression, FK violation, or transient PG error on these paths surfaced raw Postgres dialect to admins on the template save / delete / create-from-template flows. This was the last remaining mutating surface in the admin server-action layer still diverging from the MGT-023/024/025/026 pattern.

**Impact**: Raw Postgres errors visible to admins across the template management and create-from-template surfaces. No Sentry visibility for the underlying causes on template save / delete / create-from-template failures. The `createEventFromTemplate()` rollback emitted a single generic Sentry event that lost the original `dayErr` / `entriesErr` / `eventErr` stack and tags, hurting debuggability.

**Status**: Resolved — all six failure paths now follow the MGT-023/024/025/026 pattern. Each Supabase error is captured to Sentry at the point of failure with a distinct `action` sub-tag (`saveAsTemplate.insert`, `deleteTemplate.delete`, `createEventFromTemplate.insertEvent`, `createEventFromTemplate.insertDay`, `createEventFromTemplate.insertEntries`) and returns a single clean generic user-facing message (`"Could not save this template. Please retry."`, `"Could not delete this template. Please retry."`, `"Could not create this event from template. Please retry."`). `createEventFromTemplate()`'s `failureReason` is now a `'day' | 'entry' | null` marker rather than a raw-error string; the loop-level Sentry captures include `extra: { templateId, dayIndex }` so per-day failures are still diagnosable. The cascade-delete rollback behaviour on partial failure is unchanged (still deletes the partially-created event via `events` cascade). The pre-existing synthetic outer capture at the rollback site was removed — the point-of-failure captures replace it with better stack traces. `listTemplates()` (read-only) still returns `error.message` at L183 and is deferred to a future read-only-helper pass, consistent with the deferred read-only helpers called out at the end of MGT-026. No control-flow, signature, or revalidation changes; existing client inline error UIs (`TemplateActions`, `TemplatePicker`, new-event form) render the new messages without caller changes.

---

## MGT-026: events/actions.ts event-lifecycle actions leaked raw Postgres errors

**Description**: After Passes 5–7 brought the day-level actions in `events/actions.ts` (`addEventDay`, `removeEventDay`, `updateDayLabel`) and all of `orgs/actions.ts` up to a consistent "Sentry + generic message" error pattern, the **event-lifecycle** actions in `src/app/admin/events/actions.ts` were still pre-hardening. Ten failure paths across seven of the most-used admin actions returned raw Supabase `error.message` (or `err?.message`) strings directly to the admin UI with no Sentry capture:

- `createEvent()` — event insert (`eventError`) and days insert (`daysError`) failure paths
- `updateEventMetadata()` — event update
- `publishEvent()` — status update
- `unpublishEvent()` — status update
- `archiveEvent()` — status update
- `duplicateEvent()` — new-event insert (`newErr`), plus two `failureReason` strings that embedded raw `dayErr.message` / `entriesErr.message` inside the rollback return
- `saveDayEntries()` — entries delete (`delError`) and entries update/upsert (`updErr`) failure paths (the insert-failure branch was already hardened in Pass 1)

Any RLS regression, FK violation, or transient PG error on these paths surfaced raw Postgres dialect to admins on the highest-traffic flows (save, publish, unpublish, archive, duplicate) with no monitoring signal.

**Impact**: Raw Postgres errors visible to admins across the core event-lifecycle surface. No Sentry visibility for the underlying causes on save/publish/unpublish/archive/duplicate failures. Error wording varied wildly across failure modes.

**Status**: Resolved — all ten failure paths now follow the MGT-023/024/025 pattern. Each Supabase error is captured to Sentry with a distinct `action` tag (`createEvent.insertEvent`, `createEvent.insertEventNoData`, `createEvent.insertDays`, `updateEventMetadata.update`, `publishEvent.update`, `unpublishEvent.update`, `archiveEvent.update`, `duplicateEvent.insertEvent`, `duplicateEvent.insertEventNoData`, `duplicateEvent.insertDay`, `duplicateEvent.insertEntries`, `saveDayEntries.delete`, `saveDayEntries.update`) and returns a single clean generic user-facing message (`"Could not create this event. Please retry."`, `"Could not save this event. Please retry."`, `"Could not publish this event. Please retry."`, `"Could not unpublish this event. Please retry."`, `"Could not archive this event. Please retry."`, `"Could not duplicate this event. Please retry."`, `"Could not save entries. Please retry."`). `duplicateEvent()`'s `failureReason` no longer embeds raw Supabase messages — it is now a marker (`'day'` / `'entry'`) and the rollback return uses the generic message; the child errors are captured to Sentry with sub-tags at the point of failure. No control-flow, signature, or revalidation changes. Existing client components already render `result.error` through existing inline UIs — no caller changes needed. The three already-hardened day actions (`addEventDay`, `removeEventDay`, `updateDayLabel`) are untouched. Read-only helpers (`getVersionHistory`, `getSnapshotData`, `loadAllAuditLog`, `loadMoreAuditLog`) still leak raw errors and are deferred to a future pass.

---

## MGT-028: events/actions.ts read-only helpers leaked raw Postgres errors

**Description**: After Passes 5–9 brought every mutating server action in `events/actions.ts`, `orgs/actions.ts`, and `templates/actions.ts` to a consistent "Sentry + generic message" pattern (MGT-023 → MGT-027), the four read-only helpers in `src/app/admin/events/actions.ts` were explicitly deferred and still returned raw Supabase `error.message` strings with no Sentry capture:

- `getVersionHistory()` — snapshot list select
- `getSnapshotData()` — single-snapshot select (combined `error || !data` branch leaked `error?.message`)
- `loadAllAuditLog()` — full audit log fetch for a given event
- `loadMoreAuditLog()` — cursor-paginated audit log fetch

Both client call sites (`VersionHistory.handleView`, `AuditLogView.loadAll`) silently drop the error field, so any RLS regression, transient PG error, or schema drift on these read paths had zero monitoring signal — a stale or missing version history / audit panel would present as a silent "nothing loaded" with no clue to the cause.

**Impact**: Raw Postgres dialect reachable from server-action return values on the read path (any future consumer that rendered `result.error` would leak it), plus zero Sentry visibility for underlying causes on version-history and audit-log read failures. Last documented raw-leak gap in `events/actions.ts`.

**Status**: Resolved — all four read-only helpers now follow the MGT-023/024/025/026/027 pattern. Each Supabase error is captured to Sentry with a distinct `action` sub-tag (`getVersionHistory.select`, `getSnapshotData.select`, `loadAllAuditLog.select`, `loadMoreAuditLog.select`) and returns a single clean generic user-facing message (`"Could not load version history. Please retry."`, `"Could not load this snapshot. Please retry."`, `"Could not load audit log. Please retry."`, `"Could not load more audit entries. Please retry."`). `getSnapshotData()`'s combined `error || !data` branch was split so a genuine "snapshot not found" case still returns the existing `"Snapshot not found."` message without touching Sentry. No control-flow, signature, revalidation, or client changes. `listTemplates()` in `templates/actions.ts` is the last remaining read-only helper still returning `error.message` and is deferred to a future read-only-helper pass — its own scope is small and isolated to the templates surface.

---

## MGT-030: AuditLogView silently swallowed loadAllAuditLog failures and retried indefinitely

**Description**: `AuditLogView.loadAll()` in `src/components/admin/AuditLogView.tsx` called the hardened `loadAllAuditLog()` server action but only branched on `result.success === true`. On failure, `setAllLoaded(true)` never fired, the `useTransition` flipped `loadingAll` back to `false`, and the adjacent `useEffect` immediately re-fired `loadAll()` because its guard (`open && !allLoaded && !loadingAll`) became true again. A persistent server-side failure (RLS regression, transient PG error, schema drift) therefore became an **infinite retry loop** that hammered Supabase, flooded Sentry (every failed call is already captured at the server-action layer per MGT-028), and presented no error UI — the "Loading all entries..." banner flickered forever and the user had no idea anything was wrong.

**Impact**: Silent infinite retry on any `loadAllAuditLog()` failure. High server and monitoring cost, zero user feedback. Matches the silent-swallow class of bug fixed in MGT-014 / MGT-019 / MGT-022 but with the additional retry-loop hazard unique to the `useEffect`-driven auto-load.

**Status**: Resolved — added a `loadError` state to `AuditLogView`. `loadAll()` now clears it at the start of each attempt and, on `result.success === false`, sets `loadError` to the generic message returned by the server action **and** sets `allLoaded = true` so the `useEffect` guard no longer retriggers the call. A new inline red banner beneath the filter bar shows the error with a "Retry" button that clears the error and resets `allLoaded` to `false` so the existing effect picks it up on the next render. The success path, filter pipeline, CSV export, cap warning, and 2000-row safety behaviour are unchanged. Mirrors the MGT-014 / MGT-019 / MGT-022 pattern (add state, surface error inline, preserve retry path) and additionally closes the retry-loop hazard.

---

## MGT-031: NewEventPage silently swallowed listTemplates() failures and dropped ?template= preselection

**Description**: `NewEventPage` (`src/app/admin/events/new/page.tsx`) called the already-hardened `listTemplates()` server action (MGT-029: generic message + Sentry capture) inside a `useEffect`, but only branched on `result.success === true`. On failure the `templates` state stayed empty, `templatesLoaded` flipped to `true`, the "Use template" tab was hidden entirely (`hasTemplates` became `false`), and the user saw no error, no retry path, and no indication that anything had gone wrong. More dangerously, when a user arrived via `/admin/events/new?template={id}` (e.g. clicking "Use template" on `/admin/templates`), the preselection logic only ran inside the `if (result.success)` branch — so on failure the `mode` stayed `'blank'`, the `?template=` param was silently discarded, and submitting the form would create a **blank** event instead of the template-based event the user had explicitly asked for. This was the highest-impact remaining silent-swallow in the admin client layer: intent loss with no feedback.

**Impact**: Failed template-list loads were invisible to the user. The "Use template" tab disappeared with no explanation. Users who had clicked "Use template" from `/admin/templates` could submit a blank event under the impression they were creating one from a template. Zero UI feedback, zero retry affordance.

**Status**: Resolved — `NewEventPage` now extracts its template-loading logic into a `loadTemplates` `useCallback` and adds a `templatesError` state. On failure, `loadTemplates()` stores the generic error message returned by the server action, defensively resets `templates` to `[]`, and sets `templatesLoaded = true` so the effect cannot form a retry loop. A new inline red `ERROR_BANNER` renders above the mode toggle with a "Retry" button that re-invokes `loadTemplates()`. When `?template=` was present, the banner shows an additional line explaining that the preselected template could not be loaded. The "Create event" submit button's existing `disabled` expression now additionally checks `Boolean(preselectedTemplate && templatesError)` so the accidental-blank-event path is no longer reachable — a user with a preselection-request and a failed load must either successfully retry or cancel. Mirrors the MGT-014 / MGT-019 / MGT-022 / MGT-030 silent-swallow remediation pattern. Two sibling client-side silent-swallow candidates surfaced during Pass 13 exploration and are explicitly deferred: `VersionHistory.handleView()` in `src/components/admin/VersionHistory.tsx` drops `getSnapshotData()` errors (click-nothing feedback, medium impact) and `TemplatesPage` at `src/app/admin/templates/page.tsx` falls back to `[]` on server-component `listTemplates()` failure (cosmetic, requires server→client refactor).

---

## MGT-034: Admin dashboard silently swallowed event-query failures

**Description**: `AdminDashboardPage` (`src/app/admin/page.tsx`) queried the `events` table via a direct Supabase select but collapsed the result with `const { data: events } = await eventsQuery` — `error` was dropped entirely. The empty-state branch at line 85 (`!events || events.length === 0`) then rendered "No events found." with a "Create your first event →" CTA, making a transient PG error, RLS regression, or schema drift **indistinguishable** from a genuinely empty org. This was the highest-blast-radius remaining silent-swallow in the admin layer: the dashboard is the first page every admin lands on after login, and the empty-state CTA nudges users toward **creating a duplicate event** under the belief their workspace is empty. No Sentry capture existed at the query site either, so the underlying failure had zero monitoring signal. Explicitly called out at the end of MGT-033 as the next-ranked visibility fix.

**Impact**: Failed event-list loads presented as a fake "empty workspace" with a CTA to create an event. High risk of duplicate event creation on any transient Supabase failure. Zero UI feedback, zero Sentry visibility for the underlying cause.

**Status**: Resolved — `AdminDashboardPage` now destructures `{ data: events, error: eventsError }` from the query. On failure the error is captured to Sentry with `tags: { action: 'adminDashboard.listEvents' }` (mirrors the sub-tag pattern from MGT-023 → MGT-029), and a `loadError` string (`"Could not load events. Please retry."`) is computed. A new inline `ERROR_BANNER` (`role="alert"`) renders immediately above the status filter tabs so it is visible regardless of the active filter. The existing empty-state branch is unchanged — a genuine `events.length === 0` still shows "No events found." with its existing CTAs; a failed load additionally surfaces the hardened generic message above the tabs. No control-flow, filter, or rendering changes beyond the banner and Sentry capture; stays a pure server component. Mirrors the MGT-014 / MGT-019 / MGT-022 / MGT-030 / MGT-031 / MGT-032 / MGT-033 silent-swallow remediation pattern and closes the highest-impact remaining visibility gap in the admin landing surface. Two sibling candidates remain explicitly deferred for a future narrow pass: `OrgSettingsPage` at `src/app/admin/orgs/settings/page.tsx` still falls back to `[]` on `listOrgMembers()` / `listOrgInvites()` failure (MEDIUM impact, pure server-component banner fix), and `EventEditorPage` at `src/app/admin/events/[id]/page.tsx` has five distinct silent Supabase queries (days, entries, snapshots, publisher emails, audit rows — HIGH impact but broadens scope beyond a single safest fix). `orgs/actions.ts` zero `writeAuditLog()` coverage remains an observability gap deferred beyond Pass 15.

---

## MGT-033: TemplatesPage silently swallowed listTemplates failures

**Description**: `TemplatesPage` (`src/app/admin/templates/page.tsx`) is a Next.js server component that awaits the already-hardened `listTemplates()` server action (MGT-029: generic message + Sentry capture with `tags: { action: 'listTemplates.select' }`) but collapsed the result with `const templates = result.success ? result.data : []`. On failure, `result.error` was dropped entirely and the page rendered the "No templates yet." empty state — indistinguishable from a genuine zero-template org. Users had no way to tell that a transient PG error, RLS regression, or schema drift had just hidden every template in their org, and no retry affordance beyond a blind page reload. This was the last deferred silent-swallow candidate from Passes 13 and 14 — explicitly flagged at the end of MGT-031 and MGT-032 as the next scope-minimal visibility cleanup.

**Impact**: A failed templates list load was invisible to the user. An org with real templates could appear empty, and the onboarding copy ("Open an event in the editor and use 'Save as template' to create one.") would confusingly suggest the user had never saved a template when in fact the load had failed. Zero UI feedback, zero retry affordance.

**Status**: Resolved — `TemplatesPage` now captures both the list and the error string from the `listTemplates()` result (`const loadError = result.success ? null : result.error`) and renders an inline `ERROR_BANNER` (`role="alert"`) above the list / empty-state block when the load fails. The existing empty-state branch is untouched, so a genuine empty result still shows "No templates yet."; a failed load additionally surfaces the hardened generic message (`"Could not load templates. Please retry."`) above it, giving the user a clear signal that something went wrong. No retry button / client split needed — the component stays a pure server component and a reload re-executes the server action. Mirrors the MGT-014 / MGT-019 / MGT-022 / MGT-030 / MGT-031 / MGT-032 silent-swallow remediation pattern and closes the last documented silent-swallow in the admin surface. `orgs/actions.ts` zero `writeAuditLog()` coverage remains an observability gap (not a user-facing bug) and is explicitly deferred beyond Pass 15.

---

## MGT-032: VersionHistory silently swallowed getSnapshotData failures

**Description**: `VersionHistory.handleView()` in `src/components/admin/VersionHistory.tsx` called the already-hardened `getSnapshotData()` server action (MGT-028: generic message + Sentry capture with `tags: { action: 'getSnapshotData.select' }`, plus a distinct `"Snapshot not found."` branch) but only branched on `result.success === true`. On failure, `result.error` was dropped entirely: `viewingSnapshot` stayed `null`, the modal never opened, and `setLoading(false)` ran — so the user clicked the "View" link on a version row, saw the button briefly grey out via the existing `disabled={loading}` guard, and then nothing happened. No modal, no error banner, no retry affordance, no indication the click had even registered. This included both the infrastructure-failure branch (`"Could not load this snapshot. Please retry."`) and the genuine `"Snapshot not found."` branch. Last high-impact remaining silent-swallow in the admin client layer after Passes 12 and 13, and explicitly flagged as the next-ranked deferred candidate in Pass 13's exploration notes.

**Impact**: Failed snapshot loads presented as a dead click on the "View" action. Users had no way to distinguish "snapshot not found" from a transient infrastructure error, and no retry path short of closing and reopening the Version History panel or refreshing the entire event editor.

**Status**: Resolved — `VersionHistory` now tracks a `loadError: string | null` state and a `lastAttemptedSnapshotId: string | null` state. `handleView()` clears `loadError` at the start of each attempt, records the snapshot id as the retry anchor, wraps the `await` in a `try…finally` that always releases the `loading` flag, populates `viewingSnapshot` and clears the retry anchor on success, and stores `result.error` (fallback `"Could not load this snapshot. Please retry."`) on failure without opening the modal. A new `handleRetry()` helper re-invokes `handleView(lastAttemptedSnapshotId)`; a new `handleDismissError()` helper clears both state fields. A new inline red error banner (`role="alert"` / `aria-live="polite"`) renders inside the expanded panel above the version list — not inside the modal, since the modal never opens on failure — with "Retry" (disabled while `loading` or when there is no retry anchor) and "Dismiss" buttons. Both `getSnapshotData.select` and `"Snapshot not found."` branches are now surfaced through the same banner, letting the user distinguish the two via the exact returned wording. Success path, collapsible header, version list rendering, per-row `disabled={loading}` guard, modal, day-tab state, `TimetableDay` render, and empty state are all unchanged. Mirrors the MGT-014 / MGT-019 / MGT-022 / MGT-030 / MGT-031 silent-swallow remediation pattern. Two sibling candidates remain explicitly deferred for Pass 15: `TemplatesPage` at `src/app/admin/templates/page.tsx` still falls back to `[]` on server-component `listTemplates()` failure (cosmetic, requires server→client refactor), and `orgs/actions.ts` still has zero `writeAuditLog()` coverage (observability gap, multi-action scope, not a bug per se).

---

## MGT-029: listTemplates() leaked raw Postgres errors

**Description**: After Passes 9 and 10 brought every mutating server action and the four read-only helpers in `events/actions.ts` to a consistent "Sentry + generic message" pattern (MGT-027, MGT-028), `listTemplates()` in `src/app/admin/templates/actions.ts` was the **last remaining server action in the admin layer** returning a raw Supabase `error.message` to the UI with no Sentry capture. L183 contained `if (error) return { success: false, error: error.message }` — a direct raw-Postgres leak from the templates read path. The caller (`src/app/admin/templates/page.tsx`) silently dropped the `error` field and fell back to an empty list, so there was no visible UI regression today, but any future consumer rendering `result.error` would leak Postgres dialect and the failure had zero monitoring signal.

**Impact**: Raw Postgres dialect reachable from the templates list read path's return value, plus zero Sentry visibility on template-list failures (e.g. RLS regression, transient PG error, schema drift). Last documented raw-leak gap in the admin server-action layer.

**Status**: Resolved — `listTemplates()` now follows the MGT-028 pattern. The Supabase error is captured to Sentry with `tags: { action: 'listTemplates.select' }` and the function returns a single clean generic user-facing message (`"Could not load templates. Please retry."`). No control-flow, signature, revalidation, or client changes. A repo-wide `grep` for `error: error.message` across `src/` now returns zero results, confirming the admin server-action layer has no remaining raw-leak returns.

---

## MGT-015: acceptInvite() pending-state update not error-checked

**Description**: `acceptInvite()` in `src/app/admin/orgs/actions.ts` had two branches that updated `org_invites.accepted_at`: the "already-a-member" path and the "membership insert succeeded" path. Both fired the update without capturing `{ error }`. If the update failed for any reason (network blip, RLS/permission regression, row missing), the function returned `{ success: true }` and the invite row was left with `accepted_at = null`, so it would still show as "pending" forever.

**Impact**: Stale pending invites that could not be revoked cleanly, inconsistent invite-list state, and a silent failure mode the team could not see without direct DB inspection.

**Status**: Resolved — both update branches now check `{ error: markError }`, report to Sentry with `tags: { action: 'acceptInvite.markAccepted' | 'acceptInvite.markAcceptedExisting' }`, and return `{ success: false, error }` on failure. On the membership-insert path, the returned error explains that the member row *was* created (so the user has access) and the user should refresh and retry the accept step. No transaction/RPC added — out of scope for this pass.
