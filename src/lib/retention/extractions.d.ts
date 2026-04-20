import type { SupabaseClient } from '@supabase/supabase-js'

export interface RetentionOptions {
  admin: SupabaseClient<any, any, any>
  olderThanDays?: number
  now?: Date
}

export interface RetentionResult {
  rowsDeleted: number
  objectsRemoved: number
  storageErrors: string[]
}

export function runExtractionRetention(options: RetentionOptions): Promise<RetentionResult>
