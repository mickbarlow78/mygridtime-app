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
      organisations: {
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
          created_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string | null
          created_at?: string
        }
        Relationships: []
      }

      org_members: {
        Row: {
          id: string
          org_id: string
          user_id: string
          role: 'owner' | 'admin' | 'editor' | 'viewer'
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          role: 'owner' | 'admin' | 'editor' | 'viewer'
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          role?: 'owner' | 'admin' | 'editor' | 'viewer'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
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
          org_id: string
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
          org_id: string
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
          org_id?: string
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
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
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
          action: string
          detail: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          event_id?: string | null
          action: string
          detail?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          event_id?: string | null
          action?: string
          detail?: Json | null
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
          org_id: string
          name: string
          data: Json
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          data: Json
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          data?: Json
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
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

      org_invites: {
        Row: {
          id: string
          org_id: string
          email: string
          role: 'admin' | 'editor' | 'viewer'
          token: string
          invited_by: string | null
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          email: string
          role?: 'admin' | 'editor' | 'viewer'
          token?: string
          invited_by?: string | null
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          email?: string
          role?: 'admin' | 'editor' | 'viewer'
          token?: string
          invited_by?: string | null
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invites_invited_by_fkey"
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
    }

    Views: {
      [_ in never]: never
    }

    Functions: {
      get_user_org_role: {
        Args: { p_org_id: string }
        Returns: string | null
      }
    }

    Enums: {
      [_ in never]: never
    }
  }
}

// Convenience type aliases
export type Organisation   = Database['public']['Tables']['organisations']['Row']
export type OrgMember      = Database['public']['Tables']['org_members']['Row']
export type AppUser        = Database['public']['Tables']['users']['Row']
export type Event          = Database['public']['Tables']['events']['Row']
export type EventDay       = Database['public']['Tables']['event_days']['Row']
export type TimetableEntry = Database['public']['Tables']['timetable_entries']['Row']
export type AuditLog       = Database['public']['Tables']['audit_log']['Row']
export type NotificationLog = Database['public']['Tables']['notification_log']['Row']
export type OrgInvite        = Database['public']['Tables']['org_invites']['Row']
export type TimetableSnapshot = Database['public']['Tables']['timetable_snapshots']['Row']
export type Template       = Database['public']['Tables']['templates']['Row']
export type NotificationPreference = Database['public']['Tables']['notification_preferences']['Row']

/** Typed shape of the organisations.branding jsonb column. */
export type OrgBranding = {
  primaryColor?: string | null
  logoUrl?: string | null
  headerText?: string | null
}

export type EventStatus         = Event['status']
export type OrgMemberRole       = OrgMember['role']
export type NotificationStatus  = NotificationLog['status']
