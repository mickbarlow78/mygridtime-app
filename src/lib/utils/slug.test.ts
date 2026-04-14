import { describe, it, expect } from 'vitest'
import { slugify, getDatesInRange, countDaysInRange, formatDate, MAX_EVENT_DAYS } from './slug'

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

  it('no longer silently caps at 14 days (returns full range up to safety cap)', () => {
    // Bug pass 3: getDatesInRange must not silently truncate — callers are
    // responsible for validating against MAX_EVENT_DAYS. A full year is
    // clamped only by the internal 366-day safety cap, not by 14.
    const result = getDatesInRange('2026-01-01', '2026-12-31')
    expect(result.length).toBeGreaterThan(MAX_EVENT_DAYS)
    expect(result.length).toBeLessThanOrEqual(366)
  })

  it('returns a 15-day range for a 15-day span (no silent 14-day cap)', () => {
    const result = getDatesInRange('2026-05-01', '2026-05-15')
    expect(result).toHaveLength(15)
    expect(result[0]).toBe('2026-05-01')
    expect(result[14]).toBe('2026-05-15')
  })

  it('returns empty for reversed range', () => {
    expect(getDatesInRange('2026-05-12', '2026-05-10')).toEqual([])
  })
})

describe('countDaysInRange', () => {
  it('returns 1 for same-day range', () => {
    expect(countDaysInRange('2026-05-10', '2026-05-10')).toBe(1)
  })

  it('returns inclusive day count', () => {
    expect(countDaysInRange('2026-05-10', '2026-05-12')).toBe(3)
  })

  it('returns 0 for reversed range', () => {
    expect(countDaysInRange('2026-05-12', '2026-05-10')).toBe(0)
  })

  it('reports 365 days for a full year (caller must reject via MAX_EVENT_DAYS)', () => {
    expect(countDaysInRange('2026-01-01', '2026-12-31')).toBe(365)
  })
})

describe('MAX_EVENT_DAYS', () => {
  it('is 14', () => {
    expect(MAX_EVENT_DAYS).toBe(14)
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
