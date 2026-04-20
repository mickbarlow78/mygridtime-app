# MyGridTime — Claude Operating System (STRICT)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOURCE OF TRUTH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Codebase is ALWAYS the source of truth
- Docs (/docs/*.md) must reflect real code state
- If code and docs conflict → trust code → update docs immediately

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY START (EVERY SESSION)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Read:
   - /docs/CLAUDE_SETUP.md
   - all /docs/*.md

2. Confirm BEFORE doing anything:
   - will follow this file
   - code is source of truth
   - docs must match code

❌ If not confirmed → STOP

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATE AUDIT (REQUIRED BEFORE ANY WORK)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST determine from code + docs:

1. What is COMPLETED (tickets with real code)
2. What is IN PROGRESS (partial code only)
3. What is BLOCKED (with exact reason)
4. What is the SINGLE NEXT RECOMMENDED TICKET

Rules:
- Do NOT guess
- Do NOT invent tickets
- If unclear → say so

❌ Never start work without identifying the current next ticket

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORITY CONTROL (ANTI-DRIFT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Only work on the CURRENT NEXT TICKET
- If user asks for something else:
  - flag it as off-roadmap
  - wait for explicit override

- BLOCKED items MUST exist in:
  - docs/KNOWN_ISSUES.md

❌ If missing → add/update docs when relevant

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKFLOW MODES (STRICT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST operate in one mode only:

PLAN:
- analyse only
- no code changes

EXEC:
- implement only
- no redesign

REVISE:
- fix targeted issue only

❌ Never mix modes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPLEMENTATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Smallest possible change
- One ticket only
- No speculative improvements
- No unrelated refactors

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TESTING (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After ANY change:

- run: npm run typecheck
- run: npm test
- run: npm run build

If UI touched:
- verify in browser via `npm run dev`

❌ No green checks → task NOT complete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QA PREVIEW RULE (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ALWAYS use `npm run dev` for UI checks
- NEVER trust build preview for QA

If UI broken:
- STOP
- delete `.next`
- restart dev server
- re-check

❌ Do not mark complete if UI is broken or unstyled

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ERROR HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Server errors → Sentry
- UI errors → ERROR_BANNER

❌ Never break user flow

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENV / FEATURE FLAGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If API key missing:

- UI visible
- Feature disabled
- Show banner
- No API calls

| flag | key | result   |
|------|-----|----------|
| off  | any | mock     |
| on   | no  | disabled |
| on   | yes | live     |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATABASE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Supabase remote
- Migrations must be explicit

❌ Never assume environment

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOCUMENTATION (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After ANY meaningful change:

Update:
- docs/PROJECT_STATUS.md
- docs/KNOWN_ISSUES.md (if relevant)
- any affected docs

Rules:
- No contradictions
- No stale states

❌ No docs update → task NOT complete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DRIFT DETECTION (ALWAYS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST report:

- Any mismatch between docs and code
- Any missing blocked items
- Any outdated status

Format:
- doc says:
- code does:
- required fix:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEPLOY DECLARATION (REQUIRED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
State clearly:

- code changes?
- db changes?
- env changes?
- deploy required?
- manual verification required?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (STRICT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every response MUST include:

- MODE (PLAN / EXEC / REVISE)
- Model + effort
- Files changed
- Code
- Docs updated
- Verification steps/results

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE PRINCIPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
small
safe
verified

no drift
no guessing
one ticket at a time

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROADMAP SOURCE HIERARCHY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When deciding the current next ticket, use this priority order:

1. Explicit user instruction in the current chat
2. Latest approved handover / audit provided by user
3. /docs/PROJECT_STATUS.md
4. Other /docs/*.md
5. Codebase evidence

Rules:
- Code is still source of truth for implementation status
- But the NEXT ticket may come from a newer user-approved audit or handover not yet written into docs
- If a newer audit/handover defines the next ticket, treat it as planning authority
- If docs do not yet contain that ticket, flag:
  - "roadmap doc update needed"
- Do NOT reject the ticket solely because docs have not yet been updated
- Do NOT invent ticket details that were not provided