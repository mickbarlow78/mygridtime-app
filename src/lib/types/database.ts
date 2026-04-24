/**
 * Supabase database types — hand-written to match Phase 2 migration.
 *
 * ⚠️  Regenerate instead of editing manually once Supabase CLI is available:
 *   npx supabase gen types typescript --project-id <your-project-ref> --schema public \
 *     > src/lib/types/database.ts
 *
 * Or locally (requires `npx supabase start`):
 *   npx supabase gen types typescript --local > src/lib/types/database.ts
 *
 * NOTE: Every table must include `Relationships: []` to satisfy GenericTable
 * in @supabase/supabase-js ≥ 2.x — omitting it makes Schema resolve to `never`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      championships: {
        Row: {
          id: string
          name: string
          slug: string
          branding: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          branding?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          branding?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      users: {
        Row: {
          id: string
          email: string
          display_name: string | null
          platform_role: 'admin' | 'staff' | 'support' | null
          subscription_status: 'member' | 'subscriber'
          created_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          platform_role?: 'admin' | 'staff' | 'support' | null
          subscription_status?: 'member' | 'subscriber'
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string | null
          platform_role?: 'admin' | 'staff' | 'support' | null
          subscription_status?: 'member' | 'subscriber'
          created_at?: string
        }
        Relationships: []
      }

      championship_members: {
        Row: {
          id: string
          championship_id: string
          user_id: string
          role: 'owner' | 'editor'
          created_at: string
        }
        Insert: {
          id?: string
          championship_id: string
          user_id: string
          role: 'owner' | 'editor'
          created_at?: string
        }
        Update: {
          id?: string
          championship_id?: string
          user_id?: string
          role?: 'owner' | 'editor'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_members_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }

      events: {
        Row: {
          id: string
          championship_id: string
          title: string
          slug: string
          venue: string | null
          timezone: string
          status: 'draft' | 'published' | 'archived'
          published_at: string | null
          start_date: string
          end_date: string
          notes: string | null
          branding: Json | null
          notification_emails: string[]
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          championship_id: string
          title: string
          slug: string
          venue?: string | null
          timezone?: string
          status?: 'draft' | 'published' | 'archived'
          published_at?: string | null
          start_date: string
          end_date: string
          notes?: string | null
          branding?: Json | null
          notification_emails?: string[]
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          championship_id?: string
          title?: string
          slug?: string
          venue?: string | null
          timezone?: string
          status?: 'draft' | 'published' | 'archived'
          published_at?: string | null
          start_date?: string
          end_date?: string
          notes?: string | null
          branding?: Json | null
          notification_emails?: string[]
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          }
        ]
      }

      event_days: {
        Row: {
          id: string
          event_id: string
          date: string
          label: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          date: string
          label?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          date?: string
          label?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_days_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          }
        ]
      }

      timetable_entries: {
        Row: {
          id: string
          event_day_id: string
          title: string
          start_time: string
          end_time: string | null
          category: string | null
          notes: string | null
          sort_order: number
          is_break: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_day_id: string
          title: string
          start_time: string
          end_time?: string | null
          category?: string | null
          notes?: string | null
          sort_order?: number
          is_break?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_day_id?: string
          title?: string
          start_time?: string
          end_time?: string | null
          category?: string | null
          notes?: string | null
          sort_order?: number
          is_break?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_entries_event_day_id_fkey"
            columns: ["event_day_id"]
            isOneToOne: false
            referencedRelation: "event_days"
            referencedColumns: ["id"]
          }
        ]
      }

      audit_log: {
        Row: {
          id: string
          user_id: string | null
          event_id: string | null
          championship_id: string | null
          action: string
          detail: Json | null
          actor_context: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          event_id?: string | null
          championship_id?: string | null
          action: string
          detail?: Json | null
          actor_context?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          event_id?: string | null
          championship_id?: string | null
          action?: string
          detail?: Json | null
          actor_context?: Json | null
          created_at?: string
        }
        Relationships: []
      }

      notification_log: {
        Row: {
          id: string
          event_id: string | null
          type: string
          recipient_email: string
          status: 'queued' | 'sent' | 'failed'
          error: string | null
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id?: string | null
          type: string
          recipient_email: string
          status: 'queued' | 'sent' | 'failed'
          error?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string | null
          type?: string
          recipient_email?: string
          status?: 'queued' | 'sent' | 'failed'
          error?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Relationships: []
      }

      templates: {
        Row: {
          id: string
          championship_id: string
          name: string
          data: Json
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          championship_id: string
          name: string
          data: Json
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          championship_id?: string
          name?: string
          data?: Json
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }

      championship_invites: {
        Row: {
          id: string
          championship_id: string
          email: string
          role: 'editor'
          token: string
          invited_by: string | null
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          championship_id: string
          email: string
          role?: 'editor'
          token?: string
          invited_by?: string | null
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          championship_id?: string
          email?: string
          role?: 'editor'
          token?: string
          invited_by?: string | null
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_invites_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }

      notification_preferences: {
        Row: {
          id: string
          email: string
          token: string
          unsubscribed: boolean
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          token?: string
          unsubscribed?: boolean
          updated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          token?: string
          unsubscribed?: boolean
          updated_at?: string
          created_at?: string
        }
        Relationships: []
      }

      timetable_snapshots: {
        Row: {
          id: string
          event_id: string
          version: number
          data: Json
          published_by: string | null
          published_at: string
        }
        Insert: {
          id?: string
          event_id: string
          version: number
          data: Json
          published_by?: string | null
          published_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          version?: number
          data?: Json
          published_by?: string | null
          published_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_snapshots_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_snapshots_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }

      ai_extraction_log: {
        Row: {
          id: string
          championship_id: string
          user_id: string | null
          event_id: string | null
          source_mime: string
          source_bytes: number
          source_path: string | null
          model: string | null
          tokens_input: number | null
          tokens_output: number | null
          status: 'success' | 'error' | 'rate_limited' | 'validation_failed'
          error_code: string | null
          created_at: string
        }
        Insert: {
          id?: string
          championship_id: string
          user_id?: string | null
          event_id?: string | null
          source_mime: string
          source_bytes: number
          source_path?: string | null
          model?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          status: 'success' | 'error' | 'rate_limited' | 'validation_failed'
          error_code?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          championship_id?: string
          user_id?: string | null
          event_id?: string | null
          source_mime?: string
          source_bytes?: number
          source_path?: string | null
          model?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          status?: 'success' | 'error' | 'rate_limited' | 'validation_failed'
          error_code?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_extraction_log_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_extraction_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_extraction_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          }
        ]
      }
    }

    Views: {
      [_ in never]: never
    }

    Functions: {
      get_user_org_role: {
        Args: { p_org_id: string }
        Returns: string | null
      }
      is_platform_staff: {
        Args: Record<string, never>
        Returns: boolean
      }
    }

    Enums: {
      [_ in never]: never
    }
  }
}

// Convenience type aliases
export type Championship   = Database['public']['Tables']['championships']['Row']
export type ChampionshipMember = Database['public']['Tables']['championship_members']['Row']
export type AppUser        = Database['public']['Tables']['users']['Row']
export type Event          = Database['public']['Tables']['events']['Row']
export type EventDay       = Database['public']['Tables']['event_days']['Row']
export type TimetableEntry = Database['public']['Tables']['timetable_entries']['Row']
export type AuditLog       = Database['public']['Tables']['audit_log']['Row']
export type NotificationLog = Database['public']['Tables']['notification_log']['Row']
export type ChampionshipInvite = Database['public']['Tables']['championship_invites']['Row']
export type TimetableSnapshot = Database['public']['Tables']['timetable_snapshots']['Row']
export type Template       = Database['public']['Tables']['templates']['Row']
export type NotificationPreference = Database['public']['Tables']['notification_preferences']['Row']

/** Typed shape of the championships.branding jsonb column. */
export type ChampionshipBranding = {
  primaryColor?: string | null
  logoUrl?: string | null
  headerText?: string | null
}

export type EventStatus              = Event['status']
export type ChampionshipMemberRole   = ChampionshipMember['role']
export type NotificationStatus       = NotificationLog['status']
export type PlatformRole             = NonNullable<AppUser['platform_role']>

/**
 * Phase A actor_context shape for audit_log.actor_context.
 *
 * `via: 'platform'` means the action was taken by a platform staff user
 * accessing a customer org through the Phase A compatibility shortcut
 * (treated as effective org owner for permission evaluation) — they are
 * NOT a customer org owner in any business sense. `via: 'membership'`
 * is the default for actions taken by actual org members.
 */
export interface ActorContext {
  via: 'platform' | 'membership'
  platform_role?: PlatformRole | null
}
