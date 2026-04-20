## CLAUDE OPERATING RULE

All work must follow `/docs/CLAUDE_SETUP.md`
Docs must be kept in sync with code at all times.

---

# MyGridTime — Project Documentation

## Files

| File | Purpose |
|------|---------|
| `PROJECT_STATUS.md` | Current system state — what's built, in progress, and not started |
| `LAUNCH_PLAN.md` | Prioritised roadmap to market-ready v1 |
| `KNOWN_ISSUES.md` | Tracked bugs, risks, and gaps with status |
| `DECISIONS.md` | Key architectural and product decisions |
| `QA_RUNBOOKS.md` | Operational runbooks for manual verification flows (dev-only tooling, browser-driven QA) |

## Rules

1. These docs must reflect the **real codebase state** — not plans, not aspirations
2. Every meaningful change (feature, fix, behaviour change) must update the relevant doc(s)
3. No duplication across files — each fact lives in one place
4. No secrets, API keys, or credentials — use `[REDACTED]` if referencing
5. Statuses flow: `open` → `in progress` → `resolved`
