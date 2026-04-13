import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {}

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
