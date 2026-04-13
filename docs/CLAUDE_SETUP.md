# MyGridTime — Claude Operating Rules

## Core Principle

The codebase is the source of truth.
Documentation must always reflect the real system state.

## Mandatory Validation Rule

Before completing ANY task:

1. Re-check relevant code paths
2. Verify behaviour matches `/docs/*.md`
3. If mismatch:
   - Fix the code, OR
   - Update the docs
4. Then proceed

Never proceed with outdated or assumed behaviour.

## Documentation Responsibilities

For ANY change (feature, fix, refactor):

Update relevant docs automatically:

- `/docs/PROJECT_STATUS.md`
- `/docs/LAUNCH_PLAN.md`
- `/docs/KNOWN_ISSUES.md`
- `/docs/DECISIONS.md`

### Status Rules

Statuses flow: `open` → `in progress` → `resolved`

Do not leave stale statuses.

### Behaviour Rules

- If a bug is fixed → mark resolved in `KNOWN_ISSUES.md`
- If work starts → mark in progress in `PROJECT_STATUS.md`
- If behaviour changes → update descriptions across affected docs
- If a rule is introduced → add to `DECISIONS.md`
- If a risk appears → add to `KNOWN_ISSUES.md`

## Output Requirement

After any task:

1. Show code changes (if any)
2. Show updated docs (only files changed)

## Fail Condition

If docs are not updated to reflect changes, the task is incomplete.

## Security Rule

Never include:

- API keys
- Secrets
- Environment variables

Use `[REDACTED]` if referencing any of the above.

## Session Start Rule

At the start of every new session:

1. Read `/docs/CLAUDE_SETUP.md`
2. Read `/docs/*.md`
3. Confirm rules will be followed before proceeding
