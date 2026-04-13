import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { validateEnv } from './env'

// Keys that validateEnv checks
const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
const SERVER_REQUIRED = ['SUPABASE_SERVICE_ROLE_KEY']
const FEATURE_REQUIRED = ['RESEND_API_KEY', 'EMAIL_FROM']
const URL_GROUP = ['APP_URL', 'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL', 'URL']
const ALL_KEYS = [...REQUIRED, ...SERVER_REQUIRED, ...FEATURE_REQUIRED, ...URL_GROUP]

describe('validateEnv', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ALL_KEYS) {
      saved[k] = process.env[k]
    }
    saved['NODE_ENV'] = process.env.NODE_ENV as string | undefined
  })

  afterEach(() => {
    for (const k of ALL_KEYS) {
      if (saved[k] !== undefined) process.env[k] = saved[k]
      else delete process.env[k]
    }
    ;(process.env as Record<string, string | undefined>).NODE_ENV = saved['NODE_ENV'] ?? 'test'
  })

  function setAllRequired() {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    process.env.RESEND_API_KEY = 're_test'
    process.env.EMAIL_FROM = 'test@example.com'
    process.env.APP_URL = 'https://app.example.com'
  }

  it('returns no errors and no warnings when all vars are set', () => {
    setAllRequired()
    const result = validateEnv()
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('errors when required vars are missing', () => {
    setAllRequired()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const result = validateEnv()
    expect(result.errors.some((e) => e.includes('NEXT_PUBLIC_SUPABASE_URL'))).toBe(true)
  })

  it('warns when feature-required vars are missing', () => {
    setAllRequired()
    delete process.env.RESEND_API_KEY
    const result = validateEnv()
    expect(result.warnings.some((w) => w.includes('RESEND_API_KEY'))).toBe(true)
  })

  it('warns (dev) when server-required vars are missing', () => {
    setAllRequired()
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'development'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const result = validateEnv()
    expect(result.warnings.some((w) => w.includes('SUPABASE_SERVICE_ROLE_KEY'))).toBe(true)
    expect(result.errors.some((e) => e.includes('SUPABASE_SERVICE_ROLE_KEY'))).toBe(false)
  })

  it('errors (production) when server-required vars are missing', () => {
    setAllRequired()
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const result = validateEnv()
    expect(result.errors.some((e) => e.includes('SUPABASE_SERVICE_ROLE_KEY'))).toBe(true)
  })

  it('warns when no URL group vars are set (dev)', () => {
    setAllRequired()
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'development'
    for (const k of URL_GROUP) delete process.env[k]
    const result = validateEnv()
    expect(result.warnings.some((w) => w.includes('app URL'))).toBe(true)
  })
})
