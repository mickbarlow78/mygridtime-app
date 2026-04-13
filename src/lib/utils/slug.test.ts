import { describe, it, expect } from 'vitest'
import { slugify, getDatesInRange, formatDate } from './slug'

describe('slugify', () => {
  it('converts to lowercase kebab-case', () => {
    expect(slugify('Round 3 — Whilton Mill')).toBe('round-3-whilton-mill')
  })

  it('trims whitespace', () => {
    expect(slugify('  hello world  ')).toBe('hello-world')
  })

  it('collapses multiple hyphens', () => {
    expect(slugify('a---b')).toBe('a-b')
  })

  it('strips leading/trailing hyphens', () => {
    expect(slugify('-hello-')).toBe('hello')
  })

  it('handles empty string', () => {
    expect(slugify('')).toBe('')
  })

  it('handles underscores', () => {
    expect(slugify('hello_world')).toBe('hello-world')
  })
})

describe('getDatesInRange', () => {
  it('returns single date for same start/end', () => {
    expect(getDatesInRange('2026-05-10', '2026-05-10')).toEqual(['2026-05-10'])
  })

  it('returns inclusive range', () => {
    const result = getDatesInRange('2026-05-10', '2026-05-12')
    expect(result).toEqual(['2026-05-10', '2026-05-11', '2026-05-12'])
  })

  it('caps at 14 days', () => {
    const result = getDatesInRange('2026-01-01', '2026-12-31')
    expect(result).toHaveLength(14)
  })

  it('returns empty for reversed range', () => {
    expect(getDatesInRange('2026-05-12', '2026-05-10')).toEqual([])
  })
})

describe('formatDate', () => {
  it('formats ISO date as short weekday + day + month', () => {
    // 2026-05-10 is a Sunday
    const result = formatDate('2026-05-10')
    expect(result).toMatch(/Sun/)
    expect(result).toMatch(/10/)
    expect(result).toMatch(/May/)
  })
})
