# QA Runbooks

Operational, step-by-step procedures for verifying MyGridTime features
that need manual browser inspection or dev-only tooling. Each runbook
is self-contained: a new operator should be able to execute the flow
end-to-end without opening any script file or source module.

Runbooks document *how to run* existing tooling. Design rationale lives
in [DECISIONS.md](DECISIONS.md); current system state lives in
[PROJECT_STATUS.md](PROJECT_STATUS.md).

---

## Extraction Log — dev verification

**Purpose.** Populate the **Extraction log** panel on
`/admin/orgs/settings` with a representative sample of
`ai_extraction_log` rows so the UI can be exercised end-to-end — every
rendered branch (success linked / success unlinked / success linked to
soft-deleted event / error / rate_limited / validation_failed) — without
a real `ANTHROPIC_API_KEY` or a real Claude Vision call.

**When to run.** Any time the panel UI is touched, reviewed, or
demoed. The real extraction path is gated by `MGT-071-BLOCKED`
(pending `ANTHROPIC_API_KEY` provisioning), so this is currently the
only way to see the non-success branches.

**Design rationale.** See [DEC-033](DECISIONS.md) — do not duplicate
here. This runbook covers the operational flow only.

### Prerequisites

- Node.js 20+ (for the native `--env-file=.env.local` flag; no
  `dotenv` dependency).
- Local clone of `mygridtime-app` with `npm install` run.
- `.env.local` populated with the three variables below, all pointing
  at a **non-production** Supabase project.

### Required environment variables

Set these in `.env.local` at the repo root before running either
command:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (non-production). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for the same project. |
| `DEV_ADMIN_EMAIL` | Email of the seed actor. Must match a `users` row that is `owner` / `admin` / `editor` in at least one organisation. |

> **⚠ Non-production only.** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS.
> Confirm the `NEXT_PUBLIC_SUPABASE_URL` points at a dev or staging
> Supabase project **before** running. Seeded rows are scoped by the
> `seed/mgt-075/` `source_path` prefix, so cleanup is safe even in the
> unlikely event the seed lands in the wrong project — but do not rely
> on that as a guardrail.

### Seed the panel

```bash
npm run seed:extractions
```

Inserts 6 rows into `ai_extraction_log` for the first org where
`DEV_ADMIN_EMAIL` holds an elevated role:

| # | status | notes |
|---|---|---|
| 1 | `success` | linked to a live event (first non-deleted event in the org). |
| 2 | `success` | unlinked (no `event_id`). |
| 3 | `success` | linked to a soft-deleted event, or falls back to unlinked if none exist. |
| 4 | `error` | `error_code = claude_call_failed`, null tokens. |
| 5 | `rate_limited` | no model, no error_code. |
| 6 | `validation_failed` | `error_code = schema_mismatch`. |

Every row is marked with `source_path = 'seed/mgt-075/<uuid>'`. The
script prints the resolved org, acting user, and the linked / deleted
event ids it chose, plus the exact cleanup command.

### Verify in the browser

1. Start the dev server — `npm run dev` — and sign in via
   `/api/auth/dev-session` (or the magic-link flow) as
   `DEV_ADMIN_EMAIL`.
2. Open `/admin/orgs/settings`.
3. Expand the **Extraction log** panel (below **Members & invites**,
   above the **Audit log**). Confirm each state:
   - 6 rows ordered newest → oldest.
   - Three green **Success** pills — two with token counts + model, one
     showing `(event deleted)` where the linked event was soft-deleted
     (or unlinked if the org has no soft-deleted events).
   - One red **Error** pill with `claude_call_failed`.
   - One amber **Rate limited** pill with no model.
   - One orange **Validation failed** pill with `schema_mismatch`.
   - The status-pill dot + tooltip, the "Updated ·" timestamp, and the
     filter controls (status, date range, search) are all operable.
4. Exercise filters if in scope — e.g. status = `error` narrows to
   row 4; a date-range of "today" keeps all 6; clearing filters
   restores the full list.
5. Exercise the MGT-077 triage chips + sort control:
   - **Problems today** — narrows to the three non-`success` rows
     (Error, Rate limited, Validation failed). Click the active chip
     again to clear; the row count returns to 6. `aria-pressed`
     toggles `true` / `false`.
   - **All problems** — same three non-`success` rows regardless of
     date. The two chips are mutually exclusive; activating one
     deactivates the other.
   - **Sort order** select — switching to **Oldest first** inverts
     row order (Validation failed at top, Success at bottom);
     switching back to **Newest first** restores the original order.
   - **Clear filters** — shown whenever any filter or chip is active.
     Clicking it resets every filter input, both chips, **and** the
     sort order back to Newest first.

### Clean up

```bash
npm run cleanup:extractions
```

Deletes every row whose `source_path` begins with `seed/mgt-075/` and
prints the number removed. Idempotent — safe to run repeatedly.
Re-open the panel to confirm it returns to the "0 entries" empty state.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL is not set.` | `.env.local` missing or Node < 20. |
| `No users row found for DEV_ADMIN_EMAIL=...` | The email has never signed in against this Supabase project — sign in once via `/api/auth/dev-session` first. |
| `User ... has no owner/admin/editor org membership.` | Create an org (or be invited into one) with an elevated role before seeding. |
| Panel stays empty after seed | Confirm you are viewing the same org the script targeted (check the printed `Org:` line) and that your session has `owner` or `admin` role on that org (editors cannot see the panel per DEC-032). |

---

## Extraction retention — manual verification

**Purpose.** Exercise the 30-day retention cron (`GET /api/cron/retention-extractions`) locally. Confirms that `ai_extraction_log` rows older than 30 days have their `event-extractions` storage objects removed and the rows deleted; rows younger than the cutoff are untouched.

**When to run.** Any time the retention helper (`src/lib/retention/extractions.ts`), the cron route, or the `event-extractions` bucket policies change. See [DEC-035](DECISIONS.md) for design rationale.

### Prerequisites

- `.env.local` populated with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (and `DEV_ADMIN_EMAIL` if you are also seeding via MGT-075).
- The manual script calls the shared helper directly via a service-role client — no Next server needs to be running.
- To verify the HTTP route instead, additionally set `CRON_SECRET` and start `npm run dev`, then `curl -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/retention-extractions`.

### Seed test data

1. `npm run seed:extractions` — inserts 6 rows via the MGT-075 harness. The seed rows use `created_at = at(mins ago)` values that are **less than** 30 days old, so they are safe and will not be deleted by the first retention run.
2. Optionally, hand-edit one row's `created_at` via the Supabase SQL editor to e.g. `now() - interval '40 days'` to produce an eligible row. The `source_path` prefix `seed/mgt-075/` remains, so the MGT-075 cleanup still catches anything left over.

### Invoke the cron

```bash
npm run retention:extractions
```

The script imports `runExtractionRetention` from `src/lib/retention/extractions.mjs` and invokes it against a service-role client built inline. Expected output:

```
[retention:extractions] rowsDeleted=<n> objectsRemoved=<n> storageErrors=0
```

Idempotent — a second run with no eligible rows returns `rowsDeleted=0`.

### Clean up

`npm run cleanup:extractions` — removes any remaining `seed/mgt-075/%` rows inserted above.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL is not set.` | `.env.local` missing or Node < 20. |
| `SUPABASE_SERVICE_ROLE_KEY is not set.` | Same — supply the service-role key in `.env.local`. |
| (HTTP path only) `401 Unauthorized` | `CRON_SECRET` in the request does not match the value the Next process booted with — restart `npm run dev` after editing `.env.local`. |
| (HTTP path only) `503 … CRON_SECRET is not configured` | `CRON_SECRET` is unset in the server's env. |
| `storageErrors` non-zero | Storage-bucket RLS / connectivity issue. Rows for failed paths remain in `ai_extraction_log` for the next run. |
