import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getServerAppUrl, getClientAppUrl } from './app-url'

const ENV_KEYS = [
  'APP_URL',
  'NEXT_PUBLIC_APP_URL',
  'URL',
  'NEXT_PUBLIC_SITE_URL',
] as const

describe('getServerAppUrl', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] !== undefined) process.env[k] = saved[k]
      else delete process.env[k]
    }
  })

  it('returns APP_URL when set', () => {
    process.env.APP_URL = 'https://app.example.com'
    process.env.NEXT_PUBLIC_APP_URL = 'https://public.example.com'
    expect(getServerAppUrl()).toBe('https://app.example.com')
  })

  it('falls back to NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://public.example.com'
    expect(getServerAppUrl()).toBe('https://public.example.com')
  })

  it('falls back to URL (Netlify)', () => {
    process.env.URL = 'https://netlify.example.com'
    expect(getServerAppUrl()).toBe('https://netlify.example.com')
  })

  it('falls back to NEXT_PUBLIC_SITE_URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.com'
    expect(getServerAppUrl()).toBe('https://site.example.com')
  })

  it('falls back to localhost when nothing is set', () => {
    expect(getServerAppUrl()).toBe('http://localhost:3000')
  })

  it('strips trailing slash', () => {
    process.env.APP_URL = 'https://app.example.com/'
    expect(getServerAppUrl()).toBe('https://app.example.com')
  })
})

describe('getClientAppUrl', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] !== undefined) process.env[k] = saved[k]
      else delete process.env[k]
    }
  })

  it('returns NEXT_PUBLIC_APP_URL when set', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://public.example.com'
    expect(getClientAppUrl()).toBe('https://public.example.com')
  })

  it('does not use APP_URL (server-only)', () => {
    process.env.APP_URL = 'https://app.example.com'
    expect(getClientAppUrl()).not.toBe('https://app.example.com')
  })

  it('strips trailing slash', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com/'
    expect(getClientAppUrl()).toBe('https://example.com')
  })
})
