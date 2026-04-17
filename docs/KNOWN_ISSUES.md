# Known Issues

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
