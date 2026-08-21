import { execSync } from 'node:child_process'
import { withSentryConfig } from '@sentry/nextjs'

let gitCommitSha = ''
try {
  gitCommitSha = execSync('git rev-parse --short HEAD', {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim()
} catch {
  gitCommitSha = ''
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_AI_EXTRACTION_READY:
      (process.env.ANTHROPIC_API_KEY?.trim() ?? '') !== '' ? 'true' : 'false',
    NEXT_PUBLIC_GIT_COMMIT_SHA: gitCommitSha,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
  async redirects() {
    // MGT-106: admin route segment renamed /admin/orgs → /admin/championships.
    // 308 permanent redirects preserve existing bookmarks, invite links, and
    // any external URLs pointing at the legacy path.
    return [
      { source: '/admin/orgs', destination: '/admin/championships', permanent: true },
      { source: '/admin/orgs/:path*', destination: '/admin/championships/:path*', permanent: true },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  // Only upload source maps when SENTRY_AUTH_TOKEN is available (CI/deploy).
  // Local builds work fine without it — they just skip source map upload.
  // Stay quiet locally (no token), but log in CI so upload success *and
  // failure* are visible in the Netlify build log. `silent: true` suppresses
  // sentry-cli errors too, which would hide a failed upload entirely.
  silent: !process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // No `hideSourceMaps` here: it was removed in @sentry/nextjs v9 and is a
  // silent no-op in v10. Client source maps are deleted from the build output
  // after upload by the v10 default (`sourcemaps.deleteSourcemapsAfterUpload`).

  // Disable telemetry
  telemetry: false,
})
