export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      google_calendar_connections: {
        Row: {
          access_token_encrypted: string
          access_token_expires_at: string | null
          created_at: string
          google_account_email: string | null
          granted_scope: string | null
          last_error: string | null
          refresh_token_encrypted: string
          selected_calendar_id: string | null
          selected_calendar_name: string | null
          selected_calendar_timezone: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted: string
          access_token_expires_at?: string | null
          created_at?: string
          google_account_email?: string | null
          granted_scope?: string | null
          last_error?: string | null
          refresh_token_encrypted: string
          selected_calendar_id?: string | null
          selected_calendar_name?: string | null
          selected_calendar_timezone?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string
          access_token_expires_at?: string | null
          created_at?: string
          google_account_email?: string | null
          granted_scope?: string | null
          last_error?: string | null
          refresh_token_encrypted?: string
          selected_calendar_id?: string | null
          selected_calendar_name?: string | null
          selected_calendar_timezone?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_event_deletions: {
        Row: {
          calendar_id: string
          deleted_at: string
          event_key: string
          provider_event_id: string
          user_id: string
        }
        Insert: {
          calendar_id?: string
          deleted_at?: string
          event_key: string
          provider_event_id: string
          user_id: string
        }
        Update: {
          calendar_id?: string
          deleted_at?: string
          event_key?: string
          provider_event_id?: string
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_events: {
        Row: {
          calendar_id: string
          description: string | null
          end_at: string | null
          end_date: string | null
          etag: string | null
          event_key: string
          google_updated_at: string | null
          has_attendees: boolean
          html_link: string | null
          is_all_day: boolean
          location: string | null
          meeting_url: string | null
          organizer_email: string | null
          original_start_time: string | null
          private_properties: Json | null
          provider_event_id: string
          recurring_event_id: string | null
          space_id: string | null
          start_at: string | null
          start_date: string | null
          status: string
          summary: string
          time_zone: string | null
          transparency: string | null
          updated_at: string
          user_id: string
          visibility: string | null
        }
        Insert: {
          calendar_id?: string
          description?: string | null
          end_at?: string | null
          end_date?: string | null
          etag?: string | null
          event_key: string
          google_updated_at?: string | null
          has_attendees?: boolean
          html_link?: string | null
          is_all_day?: boolean
          location?: string | null
          meeting_url?: string | null
          organizer_email?: string | null
          original_start_time?: string | null
          private_properties?: Json | null
          provider_event_id: string
          recurring_event_id?: string | null
          space_id?: string | null
          start_at?: string | null
          start_date?: string | null
          status?: string
          summary?: string
          time_zone?: string | null
          transparency?: string | null
          updated_at?: string
          user_id: string
          visibility?: string | null
        }
        Update: {
          calendar_id?: string
          description?: string | null
          end_at?: string | null
          end_date?: string | null
          etag?: string | null
          event_key?: string
          google_updated_at?: string | null
          has_attendees?: boolean
          html_link?: string | null
          is_all_day?: boolean
          location?: string | null
          meeting_url?: string | null
          organizer_email?: string | null
          original_start_time?: string | null
          private_properties?: Json | null
          provider_event_id?: string
          recurring_event_id?: string | null
          space_id?: string | null
          start_at?: string | null
          start_date?: string | null
          status?: string
          summary?: string
          time_zone?: string | null
          transparency?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_events_space_fk"
            columns: ["user_id", "space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      google_calendar_sync_states: {
        Row: {
          calendar_id: string
          channel_expiration: string | null
          channel_id: string | null
          channel_token_hash: string | null
          last_error: string | null
          last_synced_at: string | null
          resource_id: string | null
          sync_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_id?: string
          channel_expiration?: string | null
          channel_id?: string | null
          channel_token_hash?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          resource_id?: string | null
          sync_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_id?: string
          channel_expiration?: string | null
          channel_id?: string | null
          channel_token_hash?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          resource_id?: string | null
          sync_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduler_queue: {
        Row: {
          attempts: number
          force_replan: boolean
          last_error: string | null
          locked_at: string | null
          reason: string
          requested_at: string
          run_after: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          force_replan?: boolean
          last_error?: string | null
          locked_at?: string | null
          reason?: string
          requested_at?: string
          run_after?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          force_replan?: boolean
          last_error?: string | null
          locked_at?: string | null
          reason?: string
          requested_at?: string
          run_after?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduler_user_locks: {
        Row: {
          lock_token: string
          locked_at: string
          user_id: string
        }
        Insert: {
          lock_token: string
          locked_at?: string
          user_id: string
        }
        Update: {
          lock_token?: string
          locked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      spaces: {
        Row: {
          archived_at: string | null
          calendar_id: string
          calendar_name: string
          created_at: string
          id: string
          name: string
          position: number
          status: string
          time_zone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          calendar_id: string
          calendar_name: string
          created_at?: string
          id?: string
          name: string
          position?: number
          status?: string
          time_zone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          calendar_id?: string
          calendar_name?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          status?: string
          time_zone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sub_spaces: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          position: number
          space_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          space_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          space_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_spaces_space_fk"
            columns: ["user_id", "space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      task_active_session_owners: {
        Row: {
          claimed_at: string
          session_id: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_at?: string
          session_id: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          claimed_at?: string
          session_id?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_active_session_owner_task_fk"
            columns: ["user_id", "task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "task_active_session_owners_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "task_work_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      task_calendar_repairs: {
        Row: {
          attempts: number
          block_id: string | null
          calendar_id: string
          created_at: string
          id: number
          last_error: string | null
          next_attempt_at: string
          operation: string
          provider_event_id: string | null
          session_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          block_id?: string | null
          calendar_id: string
          created_at?: string
          id?: number
          last_error?: string | null
          next_attempt_at?: string
          operation: string
          provider_event_id?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          block_id?: string | null
          calendar_id?: string
          created_at?: string
          id?: number
          last_error?: string | null
          next_attempt_at?: string
          operation?: string
          provider_event_id?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_calendar_repairs_block_fk"
            columns: ["user_id", "block_id"]
            isOneToOne: false
            referencedRelation: "task_schedule_blocks"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "task_calendar_repairs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "task_work_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      task_schedule_blocks: {
        Row: {
          calendar_id: string
          created_at: string
          end_at: string
          etag: string | null
          id: string
          last_error: string | null
          planned_end_at: string
          planned_start_at: string
          provider_event_id: string | null
          provider_event_key: string | null
          space_id: string | null
          start_at: string
          state: string
          sync_version: number
          task_id: string
          updated_at: string
          user_id: string
          work_session_id: string | null
        }
        Insert: {
          calendar_id: string
          created_at?: string
          end_at: string
          etag?: string | null
          id: string
          last_error?: string | null
          planned_end_at: string
          planned_start_at: string
          provider_event_id?: string | null
          provider_event_key?: string | null
          space_id?: string | null
          start_at: string
          state?: string
          sync_version?: number
          task_id: string
          updated_at?: string
          user_id: string
          work_session_id?: string | null
        }
        Update: {
          calendar_id?: string
          created_at?: string
          end_at?: string
          etag?: string | null
          id?: string
          last_error?: string | null
          planned_end_at?: string
          planned_start_at?: string
          provider_event_id?: string | null
          provider_event_key?: string | null
          space_id?: string | null
          start_at?: string
          state?: string
          sync_version?: number
          task_id?: string
          updated_at?: string
          user_id?: string
          work_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_schedule_blocks_space_fk"
            columns: ["user_id", "space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "task_schedule_blocks_task_fk"
            columns: ["user_id", "task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "task_schedule_blocks_work_session_fk"
            columns: ["user_id", "work_session_id"]
            isOneToOne: false
            referencedRelation: "task_work_sessions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      task_schedule_cleanup: {
        Row: {
          calendar_id: string
          created_at: string
          id: number
          last_error: string | null
          processed_at: string | null
          provider_event_id: string
          user_id: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          id?: number
          last_error?: string | null
          processed_at?: string | null
          provider_event_id: string
          user_id: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          id?: number
          last_error?: string | null
          processed_at?: string | null
          provider_event_id?: string
          user_id?: string
        }
        Relationships: []
      }
      task_schedule_status: {
        Row: {
          active_session_id: string | null
          missed_minutes: number
          missing_minutes: number
          remaining_minutes: number
          scheduled_minutes: number
          state: string
          task_id: string
          updated_at: string
          user_id: string
          warning: string | null
          worked_minutes: number
        }
        Insert: {
          active_session_id?: string | null
          missed_minutes?: number
          missing_minutes?: number
          remaining_minutes?: number
          scheduled_minutes?: number
          state: string
          task_id: string
          updated_at?: string
          user_id: string
          warning?: string | null
          worked_minutes?: number
        }
        Update: {
          active_session_id?: string | null
          missed_minutes?: number
          missing_minutes?: number
          remaining_minutes?: number
          scheduled_minutes?: number
          state?: string
          task_id?: string
          updated_at?: string
          user_id?: string
          warning?: string | null
          worked_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_schedule_status_task_fk"
            columns: ["user_id", "task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      task_scheduling_preferences: {
        Row: {
          default_calendar_transparency: string
          default_calendar_visibility: string
          default_max_block_minutes: number
          default_min_block_minutes: number
          enabled: boolean
          timezone: string | null
          updated_at: string
          user_id: string
          work_windows: Json
        }
        Insert: {
          default_calendar_transparency?: string
          default_calendar_visibility?: string
          default_max_block_minutes?: number
          default_min_block_minutes?: number
          enabled?: boolean
          timezone?: string | null
          updated_at?: string
          user_id: string
          work_windows?: Json
        }
        Update: {
          default_calendar_transparency?: string
          default_calendar_visibility?: string
          default_max_block_minutes?: number
          default_min_block_minutes?: number
          enabled?: boolean
          timezone?: string | null
          updated_at?: string
          user_id?: string
          work_windows?: Json
        }
        Relationships: []
      }
      task_timer_operation_receipts: {
        Row: {
          created_at: string
          id: number
          operation: string
          operation_key: string
          response: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          operation: string
          operation_key: string
          response: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          operation?: string
          operation_key?: string
          response?: Json
          user_id?: string
        }
        Relationships: []
      }
      task_work_session_revisions: {
        Row: {
          created_at: string
          id: string
          new_started_at: string
          new_stopped_at: string | null
          old_started_at: string
          old_stopped_at: string | null
          reason: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_started_at: string
          new_stopped_at?: string | null
          old_started_at: string
          old_stopped_at?: string | null
          reason: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_started_at?: string
          new_stopped_at?: string | null
          old_started_at?: string
          old_stopped_at?: string | null
          reason?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_work_session_revisions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "task_work_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      task_work_sessions: {
        Row: {
          block_id: string | null
          calendar_id: string | null
          calendar_sync_state: string
          created_at: string
          estimated_minutes_at_start: number | null
          id: string
          original_started_at: string
          original_stopped_at: string | null
          planned_end_at: string | null
          planned_start_at: string | null
          provider_event_id: string | null
          provider_event_key: string | null
          repair_needed: boolean
          source: string
          space_id: string | null
          started_at: string
          state: string
          stopped_at: string | null
          task_id: string
          updated_at: string
          user_id: string
          warning: string | null
          worked_seconds: number
        }
        Insert: {
          block_id?: string | null
          calendar_id?: string | null
          calendar_sync_state?: string
          created_at?: string
          estimated_minutes_at_start?: number | null
          id?: string
          original_started_at: string
          original_stopped_at?: string | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          provider_event_id?: string | null
          provider_event_key?: string | null
          repair_needed?: boolean
          source?: string
          space_id?: string | null
          started_at: string
          state?: string
          stopped_at?: string | null
          task_id: string
          updated_at?: string
          user_id: string
          warning?: string | null
          worked_seconds?: number
        }
        Update: {
          block_id?: string | null
          calendar_id?: string | null
          calendar_sync_state?: string
          created_at?: string
          estimated_minutes_at_start?: number | null
          id?: string
          original_started_at?: string
          original_stopped_at?: string | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          provider_event_id?: string | null
          provider_event_key?: string | null
          repair_needed?: boolean
          source?: string
          space_id?: string | null
          started_at?: string
          state?: string
          stopped_at?: string | null
          task_id?: string
          updated_at?: string
          user_id?: string
          warning?: string | null
          worked_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_work_sessions_block_fk"
            columns: ["user_id", "block_id"]
            isOneToOne: false
            referencedRelation: "task_schedule_blocks"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "task_work_sessions_space_fk"
            columns: ["user_id", "space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      tasks: {
        Row: {
          auto_schedule: boolean
          calendar_transparency: string | null
          calendar_visibility: string | null
          created_at: string
          deadline: string | null
          duration: number | null
          id: string
          max_block_minutes: number | null
          min_block_minutes: number | null
          position: number
          priority: string
          space_id: string | null
          start_date: string | null
          status: string
          sub_space_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_schedule?: boolean
          calendar_transparency?: string | null
          calendar_visibility?: string | null
          created_at?: string
          deadline?: string | null
          duration?: number | null
          id: string
          max_block_minutes?: number | null
          min_block_minutes?: number | null
          position?: number
          priority?: string
          space_id?: string | null
          start_date?: string | null
          status?: string
          sub_space_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_schedule?: boolean
          calendar_transparency?: string | null
          calendar_visibility?: string | null
          created_at?: string
          deadline?: string | null
          duration?: number | null
          id?: string
          max_block_minutes?: number | null
          min_block_minutes?: number | null
          position?: number
          priority?: string
          space_id?: string | null
          start_date?: string | null
          status?: string
          sub_space_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_space_fk"
            columns: ["user_id", "space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "tasks_sub_space_fk"
            columns: ["user_id", "space_id", "sub_space_id"]
            isOneToOne: false
            referencedRelation: "sub_spaces"
            referencedColumns: ["user_id", "space_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      refresh_scheduler_lock: {
        Args: { p_lock_token: string; p_user_id: string }
        Returns: boolean
      }
      release_scheduler_lock: {
        Args: { p_lock_token: string; p_user_id: string }
        Returns: undefined
      }
      try_claim_scheduler_lock: {
        Args: { p_lock_token: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
