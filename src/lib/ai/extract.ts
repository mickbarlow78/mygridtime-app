/**
 * Shared contract for AI-assisted event extraction (MGT-069 / MGT-070).
 *
 * Phase A (MGT-069) returns a hardcoded mock fixture matching this shape so
 * the upload → preview → create-event UX can be exercised end-to-end without
 * any external service. Phase B (MGT-070) adds `extractWithClaude()` which
 * calls Claude Vision via tool-use and returns the same contract.
 *
 * Kept dependency-free on purpose: zod is not installed in this project so
 * shape validation is done with hand-written predicates that mirror the
 * `isMetaChanges` / `TimetableDetail` pattern already used in
 * `src/components/admin/AuditLogView.tsx`.
 */
import Anthropic from '@anthropic-ai/sdk'
import { FIELD_LIMITS } from '@/lib/constants/field-limits'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedEntry {
  title: string
  /** HH:MM in 24h form, e.g. "09:30". */
  start_time: string
  /** HH:MM or null when only a start time was identified. */
  end_time: string | null
  category: string | null
  notes: string | null
  is_break: boolean
}

export interface ExtractedDay {
  /** Optional human label, e.g. "Practice day". */
  label: string | null
  /** Optional YYYY-MM-DD ISO date, relative to extracted start_date when present. */
  date: string | null
  entries: ExtractedEntry[]
}

export interface ExtractedEvent {
  title: string
  venue: string | null
  /** YYYY-MM-DD. */
  start_date: string
  /** YYYY-MM-DD. Must be >= start_date. */
  end_date: string
  /** IANA timezone, e.g. "Europe/London". */
  timezone: string
  notes: string | null
  days: ExtractedDay[]
}

// ---------------------------------------------------------------------------
// Type guards (shape validation)
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string'
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isExtractedEntry(v: unknown): v is ExtractedEntry {
  if (!isRecord(v)) return false
  if (typeof v.title !== 'string') return false
  if (typeof v.start_time !== 'string' || !TIME_RE.test(v.start_time)) return false
  if (!isStringOrNull(v.end_time)) return false
  if (typeof v.end_time === 'string' && !TIME_RE.test(v.end_time)) return false
  if (!isStringOrNull(v.category)) return false
  if (!isStringOrNull(v.notes)) return false
  if (typeof v.is_break !== 'boolean') return false
  return true
}

export function isExtractedDay(v: unknown): v is ExtractedDay {
  if (!isRecord(v)) return false
  if (!isStringOrNull(v.label)) return false
  if (!isStringOrNull(v.date)) return false
  if (typeof v.date === 'string' && !DATE_RE.test(v.date)) return false
  if (!Array.isArray(v.entries)) return false
  return v.entries.every(isExtractedEntry)
}

export function isExtractedEvent(v: unknown): v is ExtractedEvent {
  if (!isRecord(v)) return false
  if (typeof v.title !== 'string') return false
  if (!isStringOrNull(v.venue)) return false
  if (typeof v.start_date !== 'string' || !DATE_RE.test(v.start_date)) return false
  if (typeof v.end_date !== 'string' || !DATE_RE.test(v.end_date)) return false
  if (v.end_date < v.start_date) return false
  if (typeof v.timezone !== 'string') return false
  if (!isStringOrNull(v.notes)) return false
  if (!Array.isArray(v.days)) return false
  return v.days.every(isExtractedDay)
}

// ---------------------------------------------------------------------------
// Truncation helpers
// ---------------------------------------------------------------------------

/**
 * Truncates a string to `max` characters without throwing. Null and undefined
 * pass through unchanged so callers can apply uniformly to nullable fields.
 */
function clip(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null
  return value.length > max ? value.slice(0, max) : value
}

/**
 * Truncates all user-visible strings in an extracted event to the values in
 * `FIELD_LIMITS`. Applied BEFORE the data reaches `createEvent()` /
 * `saveExtractedEventContent()` so overlong model output (or pasted fixture
 * edits) can never exceed the form caps enforced elsewhere in the admin UI.
 */
export function truncateExtractedEvent(ev: ExtractedEvent): ExtractedEvent {
  return {
    title: clip(ev.title, FIELD_LIMITS.event.title) ?? '',
    venue: clip(ev.venue, FIELD_LIMITS.event.venue),
    start_date: ev.start_date,
    end_date: ev.end_date,
    timezone: ev.timezone,
    notes: clip(ev.notes, FIELD_LIMITS.event.notes),
    days: ev.days.map((d) => ({
      label: clip(d.label, FIELD_LIMITS.event.dayLabel),
      date: d.date,
      entries: d.entries.map((e) => ({
        title: clip(e.title, FIELD_LIMITS.entry.title) ?? '',
        start_time: e.start_time,
        end_time: e.end_time,
        category: clip(e.category, FIELD_LIMITS.entry.category),
        notes: clip(e.notes, FIELD_LIMITS.entry.notes),
        is_break: e.is_break,
      })),
    })),
  }
}

// ---------------------------------------------------------------------------
// Mock fixture (Phase A)
// ---------------------------------------------------------------------------

/**
 * Hardcoded extraction used by MGT-069 Phase A. Represents a believable
 * two-day karting event so the preview UI has enough variety to exercise
 * editing, day navigation, and entry ordering.
 *
 * Dates are intentionally relative-agnostic — the server action resolves
 * them to "today" and "tomorrow" at call time so the mock keeps working
 * without a calendar-aware fixture.
 */
export const MOCK_EXTRACTED_EVENT: ExtractedEvent = {
  title: 'Round 4 — Whilton Mill',
  venue: 'Whilton Mill Karting',
  start_date: '2026-05-02',
  end_date: '2026-05-03',
  timezone: 'Europe/London',
  notes: 'Extracted from a sample schedule. Please review every row before confirming.',
  days: [
    {
      label: 'Practice day',
      date: '2026-05-02',
      entries: [
        { title: 'Gates open',          start_time: '07:30', end_time: '08:15', category: 'Admin',    notes: null, is_break: false },
        { title: 'Sign-on',             start_time: '08:15', end_time: '08:45', category: 'Admin',    notes: null, is_break: false },
        { title: 'Drivers briefing',    start_time: '08:45', end_time: '09:00', category: 'Briefing', notes: null, is_break: false },
        { title: 'Practice session 1',  start_time: '09:00', end_time: '09:30', category: 'Practice', notes: 'Junior + Senior groups rotate every 10 min.', is_break: false },
        { title: 'Lunch',               start_time: '12:30', end_time: '13:30', category: null,       notes: null, is_break: true  },
      ],
    },
    {
      label: 'Race day',
      date: '2026-05-03',
      entries: [
        { title: 'Warm-up',             start_time: '08:30', end_time: '09:00', category: 'Practice', notes: null, is_break: false },
        { title: 'Heat 1',              start_time: '09:15', end_time: '09:45', category: 'Race',     notes: null, is_break: false },
        { title: 'Heat 2',              start_time: '10:00', end_time: '10:30', category: 'Race',     notes: null, is_break: false },
        { title: 'Final',               start_time: '14:00', end_time: '14:45', category: 'Race',     notes: 'Top 16 qualify from heats.', is_break: false },
        { title: 'Podium',              start_time: '15:00', end_time: '15:30', category: 'Admin',    notes: null, is_break: false },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Claude Vision extraction (Phase B — MGT-070)
// ---------------------------------------------------------------------------

export type ExtractSupportedMime = 'application/pdf' | 'image/png' | 'image/jpeg'

export interface ExtractWithClaudeArgs {
  bytes: Buffer
  mime: ExtractSupportedMime
}

export interface ExtractWithClaudeResult {
  event: ExtractedEvent
  model: string
  tokens_input: number
  tokens_output: number
}

export class ExtractValidationError extends Error {
  constructor(message = 'Model response did not match ExtractedEvent contract') {
    super(message)
    this.name = 'ExtractValidationError'
  }
}

const DEFAULT_EXTRACT_MODEL = 'claude-sonnet-4-6'

/**
 * JSON schema for the `emit_event` tool. Mirrors ExtractedEvent so the model
 * is forced to return structured output rather than prose. We still run the
 * `isExtractedEvent` guard afterwards — schema validation by the API is a
 * best-effort hint, not a hard constraint.
 */
const EMIT_EVENT_TOOL = {
  name: 'emit_event',
  description:
    'Emit the structured timetable extracted from the uploaded document. Call this exactly once.',
  input_schema: {
    type: 'object',
    required: ['title', 'start_date', 'end_date', 'timezone', 'days'],
    properties: {
      title: { type: 'string' },
      venue: { type: ['string', 'null'] },
      start_date: { type: 'string', description: 'YYYY-MM-DD' },
      end_date: { type: 'string', description: 'YYYY-MM-DD, >= start_date' },
      timezone: { type: 'string', description: 'IANA tz, e.g. Europe/London' },
      notes: { type: ['string', 'null'] },
      days: {
        type: 'array',
        items: {
          type: 'object',
          required: ['label', 'date', 'entries'],
          properties: {
            label: { type: ['string', 'null'] },
            date: { type: ['string', 'null'], description: 'YYYY-MM-DD or null' },
            entries: {
              type: 'array',
              items: {
                type: 'object',
                required: ['title', 'start_time', 'end_time', 'category', 'notes', 'is_break'],
                properties: {
                  title: { type: 'string' },
                  start_time: { type: 'string', description: 'HH:MM 24h' },
                  end_time: { type: ['string', 'null'], description: 'HH:MM 24h or null' },
                  category: { type: ['string', 'null'] },
                  notes: { type: ['string', 'null'] },
                  is_break: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
  },
} as const

const EXTRACTION_SYSTEM_PROMPT = [
  'You extract motorsport / karting / club event timetables from uploaded documents.',
  'You ALWAYS call the emit_event tool exactly once.',
  'Rules:',
  '- Times must be HH:MM 24-hour (e.g. "09:30", "14:00"). Never AM/PM.',
  '- end_time may be null if the source only lists a start time.',
  '- Dates must be YYYY-MM-DD. end_date must be >= start_date.',
  '- timezone defaults to "Europe/London" unless the document states otherwise.',
  '- is_break = true for lunch, breaks, gaps; false for sessions, races, briefings.',
  '- Preserve the original ordering of entries within each day.',
  '- If a field is genuinely absent, emit null — do not invent content.',
  '- Titles should be concise (≤ 120 chars).',
].join('\n')

/**
 * Call Claude Vision with the uploaded document and return the structured
 * ExtractedEvent plus token usage. Throws {@link ExtractValidationError} if
 * the model response fails the hand-written type guard. Any SDK error is
 * rethrown as-is for the caller to log.
 */
export async function extractWithClaude(
  args: ExtractWithClaudeArgs
): Promise<ExtractWithClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }
  const client = new Anthropic({ apiKey })
  const model = process.env.MGT_EXTRACT_MODEL?.trim() || DEFAULT_EXTRACT_MODEL
  const base64 = args.bytes.toString('base64')

  const documentBlock =
    args.mime === 'application/pdf'
      ? {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
        }
      : {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: args.mime, data: base64 },
        }

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: EXTRACTION_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [EMIT_EVENT_TOOL],
    tool_choice: { type: 'tool', name: 'emit_event' },
    messages: [
      {
        role: 'user',
        content: [
          documentBlock,
          {
            type: 'text',
            text: 'Extract the event timetable from this document and call emit_event.',
          },
        ],
      },
    ],
  })

  const toolBlock = response.content.find(
    (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use'
  )
  if (!toolBlock || toolBlock.name !== 'emit_event') {
    throw new ExtractValidationError('Model did not return a tool_use block')
  }

  const candidate = toolBlock.input as unknown
  if (!isExtractedEvent(candidate)) {
    throw new ExtractValidationError()
  }

  return {
    event: candidate,
    model,
    tokens_input: response.usage.input_tokens,
    tokens_output: response.usage.output_tokens,
  }
}
