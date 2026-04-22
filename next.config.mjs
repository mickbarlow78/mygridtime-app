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
}

export default withSentryConfig(nextConfig, {
  // Only upload source maps when SENTRY_AUTH_TOKEN is available (CI/deploy).
  // Local builds work fine without it — they just skip source map upload.
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Wipe source maps from the client bundle after upload
  hideSourceMaps: true,

  // Disable telemetry
  telemetry: false,
})
