import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getFromAddress } from './client'

// getResendClient depends on the `resend` package which requires a real API key
// to instantiate usefully — we test the null-without-key path and from-address fallback.

describe('getResendClient', () => {
  const savedKey = process.env.RESEND_API_KEY

  beforeEach(() => {
    delete process.env.RESEND_API_KEY
  })

  afterEach(() => {
    if (savedKey !== undefined) process.env.RESEND_API_KEY = savedKey
    else delete process.env.RESEND_API_KEY
  })

  it('returns null when RESEND_API_KEY is not set', async () => {
    // Dynamic import to avoid module-level caching issues
    const { getResendClient } = await import('./client')
    // Reset the module-level cached client by clearing env
    // The function checks process.env on each call
    expect(getResendClient()).toBeNull()
  })
})

describe('getFromAddress', () => {
  const savedFrom = process.env.EMAIL_FROM

  beforeEach(() => {
    delete process.env.EMAIL_FROM
  })

  afterEach(() => {
    if (savedFrom !== undefined) process.env.EMAIL_FROM = savedFrom
    else delete process.env.EMAIL_FROM
  })

  it('returns EMAIL_FROM when set', () => {
    process.env.EMAIL_FROM = 'test@example.com'
    expect(getFromAddress()).toBe('test@example.com')
  })

  it('falls back to noreply@mygridtime.com', () => {
    expect(getFromAddress()).toBe('noreply@mygridtime.com')
  })
})
