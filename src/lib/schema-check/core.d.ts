// MGT-110 / DEC-045 — types for the pure schema-check core (core.mjs).

export declare const FAIL_CODES: {
  readonly MISSING_TABLE: 'PGRST205'
  readonly MISSING_RELATIONSHIP: 'PGRST200'
}

export declare const SENTINEL_TABLE: 'organisations'

export type ProbeKind = 'ok' | 'missing-table' | 'missing-relationship' | 'unverifiable' | 'unexpected'

export interface ProbeResult {
  kind: ProbeKind
  status?: number
  code?: string | null
  message?: string
  reason?: string
  note?: string
  bodyPreview?: string
}

export declare function classifyProbe(input: {
  status: number
  contentType?: string
  body?: string
}): ProbeResult

export interface SourceFile {
  path: string
  source: string
}

export interface CodeLocation {
  path: string
  line: number
}

export declare function receiverOf(source: string, dotIndex: number): 'Array' | 'Buffer' | 'storage' | 'client'

export declare function extractTableRefs(files: SourceFile[]): {
  tables: Map<string, CodeLocation[]>
  dynamic: CodeLocation[]
}

export interface EmbedRef {
  table: string
  select: string
  path: string
  line: number
}

export declare function extractEmbedRefs(files: SourceFile[]): EmbedRef[]

export interface AllowlistTableEntry {
  name: string
  reason?: string
  addedBy?: string
}

export interface AllowlistEmbedEntry {
  from: string
  select: string
  reason?: string
  addedBy?: string
}

export interface Allowlist {
  tables: AllowlistTableEntry[]
  embeds: AllowlistEmbedEntry[]
  dynamicFromBaseline: number
}

export declare function normaliseAllowlist(raw: unknown): Allowlist
export declare function isTableAllowed(allowlist: Allowlist, name: string): boolean
export declare function isEmbedAllowed(allowlist: Allowlist, table: string, select: string): boolean
export declare function staleAllowlistEntries(
  allowlist: Allowlist,
  failures: { tables?: string[]; embeds?: Array<{ from: string; select: string }> }
): string[]

export declare function formatPassBanner(input: {
  host: string
  tableCount: number
  embedCount: number
  elapsedMs: number
  unexpected?: string[]
  stale?: string[]
}): string

export declare function formatSkipBanner(input: {
  host: string
  reason: string
  status: number
  contentType?: string
  bodyPreview?: string
}): string

export declare function formatFailBanner(input: {
  host: string
  missingTables: Array<{ name: string; locations: CodeLocation[] }>
  missingEmbeds: EmbedRef[]
  dynamicExcess?: string | null
}): string

export declare function formatUnsoundBanner(input: {
  host: string
  sentinelResult: ProbeResult
}): string
