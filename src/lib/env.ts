/**
 * Centralised environment variable validation.
 *
 * Called once on server startup via instrumentation.ts.
 * Existing runtime guards in Supabase/Resend clients remain as secondary safety.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EnvLevel = 'required' | 'server-required' | 'feature-required' | 'optional'

interface EnvVarDef {
  name: string
  level: EnvLevel
  description: string
}

interface EnvGroupDef {
  names: string[]
  level: EnvLevel
  description: string
}

interface ValidationResult {
  errors: string[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Registry — single source of truth for env var expectations
// ---------------------------------------------------------------------------

const ENV_VARS: EnvVarDef[] = [
  // Required in ALL environments — app cannot function without these
  { name: 'NEXT_PUBLIC_SUPABASE_URL', level: 'required', description: 'Supabase project URL' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', level: 'required', description: 'Supabase anonymous key' },

  // Required on the server in production — admin operations break without this
  { name: 'SUPABASE_SERVICE_ROLE_KEY', level: 'server-required', description: 'Supabase admin operations' },

  // Feature-required — warn everywhere, but app still runs without email
  { name: 'RESEND_API_KEY', level: 'feature-required', description: 'Transactional email via Resend' },
  { name: 'EMAIL_FROM', level: 'feature-required', description: 'Verified sender email address' },
  { name: 'ANTHROPIC_API_KEY', level: 'feature-required', description: 'Claude API key for AI timetable extraction (MGT-070)' },

  // Optional — features degrade gracefully when absent
  { name: 'MGT_AI_EXTRACTION_ENABLED', level: 'optional', description: 'Feature flag for real Claude Vision extraction (defaults to off — mock fixture returned)' },
  { name: 'MGT_EXTRACT_MODEL', level: 'optional', description: 'Claude model ID used for extraction (defaults to claude-sonnet-4-6)' },
  { name: 'NEXT_PUBLIC_SENTRY_DSN', level: 'optional', description: 'Sentry client-side error tracking' },
  { name: 'SENTRY_DSN', level: 'optional', description: 'Sentry server-side error tracking' },
  { name: 'SENTRY_ORG', level: 'optional', description: 'Sentry org (build-time source maps)' },
  { name: 'SENTRY_PROJECT', level: 'optional', description: 'Sentry project (build-time source maps)' },
  { name: 'SENTRY_AUTH_TOKEN', level: 'optional', description: 'Sentry auth token (build-time source maps)' },
  { name: 'DEBUG_NOTIFICATIONS', level: 'optional', description: 'Verbose notification debug logging' },
  { name: 'DEV_ADMIN_EMAIL', level: 'optional', description: 'Auto-login email for local dev (development only)' },
]

/** At least one of these must be set for email links and redirects. */
const ENV_GROUPS: EnvGroupDef[] = [
  {
    names: ['APP_URL', 'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL', 'URL'],
    level: 'server-required',
    description: 'At least one app URL must be set for email links and redirects',
  },
]

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isSet(name: string): boolean {
  const v = process.env[name]
  return typeof v === 'string' && v.trim() !== ''
}

export function validateEnv(): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const isProduction = process.env.NODE_ENV === 'production'

  for (const v of ENV_VARS) {
    if (isSet(v.name)) continue

    const msg = `${v.name} is not set \u2014 ${v.description}`

    switch (v.level) {
      case 'required':
        // App cannot function — error in all environments
        errors.push(msg)
        break
      case 'server-required':
        // Server features break — error in production, warning in dev
        if (isProduction) {
          errors.push(msg)
        } else {
          warnings.push(msg)
        }
        break
      case 'feature-required':
        // Feature degrades — warning everywhere
        warnings.push(msg)
        break
      // optional: silent
    }
  }

  for (const group of ENV_GROUPS) {
    if (group.names.some(isSet)) continue

    const msg = `None of [${group.names.join(', ')}] are set \u2014 ${group.description}`

    switch (group.level) {
      case 'required':
        errors.push(msg)
        break
      case 'server-required':
        if (isProduction) {
          errors.push(msg)
        } else {
          warnings.push(msg)
        }
        break
      case 'feature-required':
        warnings.push(msg)
        break
    }
  }

  return { errors, warnings }
}

// ---------------------------------------------------------------------------
// Startup hook — called from instrumentation.ts
// ---------------------------------------------------------------------------

export function validateEnvOnStartup(): void {
  const { errors, warnings } = validateEnv()

  if (warnings.length > 0) {
    console.warn(
      `\n\u26A0 Environment warnings (${warnings.length}):\n` +
        warnings.map((w) => `  - ${w}`).join('\n') +
        '\n',
    )
  }

  if (errors.length > 0) {
    const message =
      `\n\u2716 Missing required environment variables (${errors.length}):\n` +
      errors.map((e) => `  - ${e}`).join('\n') +
      '\n\nThe app cannot start. Check your .env.local or hosting environment variables.\n'

    if (process.env.NODE_ENV === 'production') {
      throw new Error(message)
    } else {
      console.error(message)
    }
  }
}
