import { describe, it, expect } from 'vitest'
import {
  MOCK_EXTRACTED_EVENT,
  isExtractedEvent,
  isExtractedDay,
  isExtractedEntry,
  truncateExtractedEvent,
  type ExtractedEvent,
} from './extract'
import { FIELD_LIMITS } from '@/lib/constants/field-limits'

describe('extract type guards', () => {
  it('accepts the mock fixture as a valid ExtractedEvent', () => {
    expect(isExtractedEvent(MOCK_EXTRACTED_EVENT)).toBe(true)
  })

  it('rejects a malformed entry (missing start_time)', () => {
    const bad = { title: 'x', end_time: null, category: null, notes: null, is_break: false }
    expect(isExtractedEntry(bad)).toBe(false)
  })

  it('rejects an entry with a non-HH:MM start_time', () => {
    const bad = { title: 'x', start_time: '9am', end_time: null, category: null, notes: null, is_break: false }
    expect(isExtractedEntry(bad)).toBe(false)
  })

  it('rejects a day whose entries include an invalid row', () => {
    const day = {
      label: null,
      date: null,
      entries: [{ title: 'ok', start_time: '09:00', end_time: null, category: null, notes: null, is_break: false }, { bad: true }],
    }
    expect(isExtractedDay(day)).toBe(false)
  })

  it('rejects an event whose end_date is before start_date', () => {
    const ev: unknown = {
      ...MOCK_EXTRACTED_EVENT,
      start_date: '2026-05-10',
      end_date: '2026-05-01',
    }
    expect(isExtractedEvent(ev)).toBe(false)
  })

  it('rejects non-ISO date strings', () => {
    const ev: unknown = { ...MOCK_EXTRACTED_EVENT, start_date: '02/05/2026' }
    expect(isExtractedEvent(ev)).toBe(false)
  })

  it('rejects primitives and arrays at the top level', () => {
    expect(isExtractedEvent(null)).toBe(false)
    expect(isExtractedEvent('x')).toBe(false)
    expect(isExtractedEvent([])).toBe(false)
  })
})

describe('truncateExtractedEvent', () => {
  it('caps title at FIELD_LIMITS.event.title', () => {
    const long = 'a'.repeat(FIELD_LIMITS.event.title + 50)
    const ev: ExtractedEvent = { ...MOCK_EXTRACTED_EVENT, title: long }
    const out = truncateExtractedEvent(ev)
    expect(out.title.length).toBe(FIELD_LIMITS.event.title)
  })

  it('caps entry title at FIELD_LIMITS.entry.title', () => {
    const long = 'b'.repeat(FIELD_LIMITS.entry.title + 20)
    const ev: ExtractedEvent = {
      ...MOCK_EXTRACTED_EVENT,
      days: [
        {
          label: null,
          date: null,
          entries: [
            { title: long, start_time: '09:00', end_time: null, category: null, notes: null, is_break: false },
          ],
        },
      ],
    }
    const out = truncateExtractedEvent(ev)
    expect(out.days[0].entries[0].title.length).toBe(FIELD_LIMITS.entry.title)
  })

  it('leaves within-limit strings untouched', () => {
    const out = truncateExtractedEvent(MOCK_EXTRACTED_EVENT)
    expect(out.title).toBe(MOCK_EXTRACTED_EVENT.title)
    expect(out.days[0].entries[0].title).toBe(MOCK_EXTRACTED_EVENT.days[0].entries[0].title)
  })

  it('preserves null fields without coercing them to empty strings', () => {
    const ev: ExtractedEvent = { ...MOCK_EXTRACTED_EVENT, venue: null, notes: null }
    const out = truncateExtractedEvent(ev)
    expect(out.venue).toBeNull()
    expect(out.notes).toBeNull()
  })
})
