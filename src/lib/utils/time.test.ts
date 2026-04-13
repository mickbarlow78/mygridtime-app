import { describe, it, expect } from 'vitest'
import { formatTime } from './time'

describe('formatTime', () => {
  it('trims HH:MM:SS to HH:MM', () => {
    expect(formatTime('09:30:00')).toBe('09:30')
  })

  it('handles HH:MM input (already short)', () => {
    expect(formatTime('14:00')).toBe('14:00')
  })

  it('returns empty string for null', () => {
    expect(formatTime(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatTime(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(formatTime('')).toBe('')
  })
})
