# Phase 0: Repository + Deployment

## Objective
Create the GitHub repository, push the initial codebase, configure branch protection, connect Netlify for auto-deployment and set up environment variables. After this phase, every push to main deploys to production and every PR gets a preview deploy.

## Prerequisites
- GitHub account with access to create repositories
- Netlify account (free tier is fine)
- Git installed locally
- Project folder exists (even if empty — Phase 1 will scaffold the app)

## What to Do

### 1. Create GitHub Repository

Go to github.com → New Repository:
- Name: `tkc-timetable`
- Visibility: Private
- Do NOT initialise with README, .gitignore or licence (we'll push from local)

### 2. Initialise Local Git

```bash
cd tkc-timetable
git init
git branch -M main
```

### 3. Create .gitignore

```
# Dependencies
node_modules/
.pnp
.pnp.js

# Next.js
.next/
out/

# Build
build/
dist/

# Environment
.env
.env.local
.env*.local

# Supabase
supabase/.temp/
supabase/.branches/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
```

### 4. Create Initial README

```markdown
# TKC Timetable Platform

Race-day schedule and alert system for karting events.

## Tech Stack
- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (PostgreSQL, Auth, Edge Functions)
- Resend, Twilio, Stripe, Claude Vision API (later phases)

## Getting Started
See CLAUDE.md for project conventions and architecture.
See docs/phases/ for build briefs.

## Development
\`\`\`bash
npm install
npm run dev          # Start Next.js dev server
npx supabase start   # Start local Supabase
\`\`\`
```

### 5. Add Project Documents

Create docs folder and copy in the key reference documents:
```
docs/
├── phases/
│   ├── phase-0-repo-deploy.md
│   ├── phase-1-foundation.md
│   ├── phase-2-schema-auth.md
│   ├── phase-3-admin-crud.md
│   ├── phase-4-public-timetable.md
│   ├── phase-5-email-notifications.md
│   ├── phase-6-multi-org-templates.md
│   ├── phase-7a-pwa-push-drivers.md
│   ├── phase-7b-ai-extraction.md
│   ├── phase-7c-paid-alerts-stripe.md
│   └── phase-7d-community-updates.md
└── (optional: markdown versions of spec docs)
```

Place `CLAUDE.md` in the project root.

### 6. Initial Commit + Push

```bash
git add .
git commit -m "chore: initial project setup with docs and CLAUDE.md"
git remote add origin git@github.com:YOUR_USERNAME/tkc-timetable.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username or organisation.

### 7. Branch Protection on Main

Go to GitHub → Repository → Settings → Branches → Add rule:
- Branch name pattern: `main`
- Enable:
  - ✅ Require a pull request before merging
  - ✅ Require status checks to pass (add later when CI exists)
  - ✅ Do not allow bypassing the above settings (optional — disable if you're sole developer and want to push direct during early phases)

For solo development, you can keep this loose initially and tighten once CI is running (Phase 1).

### 8. Create Netlify Project

**Option A — Netlify UI:**
1. Log in to app.netlify.com
2. "Add new site" → "Import an existing project"
3. Connect GitHub → select `tkc-timetable` repository
4. Build settings:
   - Build command: `npm run build`
   - Publish directory: `.next`
   - (Netlify auto-detects Next.js — these may be pre-filled)
5. Deploy site

**Option B — Netlify CLI:**
```bash
npm install -g netlify-cli
netlify login
netlify init
# Follow prompts: link to existing repo, set build command and publish dir
```

### 9. Configure Netlify for Next.js

Netlify needs the `@netlify/plugin-nextjs` plugin for full Next.js support (SSR, ISR, API routes).

**Create netlify.toml in project root:**
```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

Install the plugin:
```bash
npm install -D @netlify/plugin-nextjs
```

### 10. Environment Variables in Netlify

Go to Netlify → Site settings → Environment variables.

Add these (leave values blank for now — Phase 1 will populate local values, production values added when Supabase production project is created):

| Variable | Scope | Value |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | All deploys | (set when prod Supabase ready) |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | All deploys | (set when prod Supabase ready) |
| SUPABASE_SERVICE_ROLE_KEY | All deploys | (set when prod Supabase ready) |
| NEXT_PUBLIC_SITE_URL | Production | https://your-site.netlify.app |
| NEXT_PUBLIC_SITE_URL | Deploy previews | (auto — Netlify sets DEPLOY_URL) |
| RESEND_API_KEY | All deploys | (set in Phase 5) |
| ANTHROPIC_API_KEY | All deploys | (set in Phase 7b) |
| TWILIO_ACCOUNT_SID | All deploys | (set in Phase 7c) |
| TWILIO_AUTH_TOKEN | All deploys | (set in Phase 7c) |
| TWILIO_FROM_NUMBER | All deploys | (set in Phase 7c) |
| STRIPE_SECRET_KEY | All deploys | (set in Phase 7c) |
| STRIPE_WEBHOOK_SECRET | All deploys | (set in Phase 7c) |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | All deploys | (set in Phase 7c) |
| VAPID_PUBLIC_KEY | All deploys | (set in Phase 7a) |
| VAPID_PRIVATE_KEY | All deploys | (set in Phase 7a) |

### 11. Verify Deploy

After Netlify build completes:
1. Visit the Netlify URL (e.g. https://tkc-timetable.netlify.app)
2. Should see the landing page (or a placeholder if Phase 1 hasn't been built yet)
3. Check Netlify deploy logs for any build errors

### 12. Preview Deploys

Test that preview deploys work:
```bash
git checkout -b test/preview-deploy
echo "<!-- test -->" >> README.md
git add . && git commit -m "test: verify preview deploy"
git push -u origin test/preview-deploy
```
- Open a PR on GitHub
- Netlify should auto-create a preview deploy
- Verify the preview URL works
- Close/delete the PR and branch after testing

### 13. Custom Domain (Optional — Do When Ready)

When you have a domain ready (e.g. timetable.tkc.com):
1. Netlify → Site settings → Domain management → Add custom domain
2. Add CNAME record at your DNS provider pointing to Netlify
3. Netlify auto-provisions SSL via Let's Encrypt
4. Update NEXT_PUBLIC_SITE_URL in Netlify env vars

## Branch Strategy

| Branch | Purpose | Deploys To |
|---|---|---|
| main | Production-ready code | Netlify production |
| feature/* | Feature development | Netlify preview deploy (auto from PR) |
| hotfix/* | Urgent production fixes | Preview → merge to main |

Workflow:
1. Create feature branch from main
2. Build + test locally
3. Push branch → PR → preview deploy auto-created
4. Review preview deploy
5. Merge to main → production deploy auto-triggered

## Acceptance Criteria
- [ ] GitHub repository exists and is private
- [ ] Local project pushed to main branch
- [ ] CLAUDE.md and docs/phases/ committed to repo
- [ ] .gitignore prevents node_modules, .env.local, .next from being committed
- [ ] Netlify project connected to GitHub repo
- [ ] Push to main triggers auto-deploy on Netlify
- [ ] Netlify build succeeds (even if just a placeholder page)
- [ ] PR creates a preview deploy with unique URL
- [ ] netlify.toml exists with Next.js plugin configured
- [ ] Environment variable slots created in Netlify (values added later)
- [ ] Branch protection rule exists on main (can be loose for now)

## Test Commands
```bash
git status                    # Clean working directory
git remote -v                 # Shows GitHub origin
git log --oneline -5          # Shows commits
netlify status                # Shows linked site (if using CLI)
# Visit: https://your-site.netlify.app → deploys successfully
# Create PR → verify preview deploy URL in PR comments
```

## Do NOT Do in This Phase
- Scaffold the Next.js app (Phase 1)
- Create database schema (Phase 2)
- Set up Supabase production project (do when ready for real users)
- Buy or configure custom domain (do when ready)
