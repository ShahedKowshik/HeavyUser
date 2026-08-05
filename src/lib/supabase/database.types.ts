export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      google_calendar_connections: {
        Row: {
          user_id: string;
          google_account_email: string | null;
          selected_calendar_id: string | null;
          selected_calendar_name: string | null;
          selected_calendar_timezone: string | null;
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          access_token_expires_at: string | null;
          granted_scope: string | null;
          status: string;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          google_account_email?: string | null;
          selected_calendar_id?: string | null;
          selected_calendar_name?: string | null;
          selected_calendar_timezone?: string | null;
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          access_token_expires_at?: string | null;
          granted_scope?: string | null;
          status?: string;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          google_account_email?: string | null;
          selected_calendar_id?: string | null;
          selected_calendar_name?: string | null;
          selected_calendar_timezone?: string | null;
          access_token_encrypted?: string;
          refresh_token_encrypted?: string;
          access_token_expires_at?: string | null;
          granted_scope?: string | null;
          status?: string;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      spaces: {
        Row: {
          id: string;
          user_id: string;
          calendar_id: string;
          name: string;
          calendar_name: string;
          time_zone: string;
          status: string;
          position: number;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          calendar_id: string;
          name: string;
          calendar_name: string;
          time_zone?: string;
          status?: string;
          position?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          calendar_id?: string;
          name?: string;
          calendar_name?: string;
          time_zone?: string;
          status?: string;
          position?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sub_spaces: {
        Row: {
          id: string;
          user_id: string;
          space_id: string;
          name: string;
          status: string;
          position: number;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          space_id: string;
          name: string;
          status?: string;
          position?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          space_id?: string;
          name?: string;
          status?: string;
          position?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      google_calendar_sync_states: {
        Row: {
          user_id: string;
          calendar_id: string;
          sync_token: string | null;
          channel_id: string | null;
          resource_id: string | null;
          channel_token_hash: string | null;
          channel_expiration: string | null;
          last_synced_at: string | null;
          last_error: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          calendar_id?: string;
          sync_token?: string | null;
          channel_id?: string | null;
          resource_id?: string | null;
          channel_token_hash?: string | null;
          channel_expiration?: string | null;
          last_synced_at?: string | null;
          last_error?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          calendar_id?: string;
          sync_token?: string | null;
          channel_id?: string | null;
          resource_id?: string | null;
          channel_token_hash?: string | null;
          channel_expiration?: string | null;
          last_synced_at?: string | null;
          last_error?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      google_calendar_event_deletions: {
        Row: {
          user_id: string;
          calendar_id: string;
          event_key: string;
          provider_event_id: string;
          deleted_at: string;
        };
        Insert: {
          user_id: string;
          calendar_id?: string;
          event_key: string;
          provider_event_id: string;
          deleted_at?: string;
        };
        Update: {
          user_id?: string;
          calendar_id?: string;
          event_key?: string;
          provider_event_id?: string;
          deleted_at?: string;
        };
        Relationships: [];
      };
      google_calendar_events: {
        Row: {
          event_key: string;
          user_id: string;
          calendar_id: string;
          space_id: string | null;
          provider_event_id: string;
          recurring_event_id: string | null;
          original_start_time: string | null;
          status: string;
          summary: string;
          description: string | null;
          location: string | null;
          meeting_url: string | null;
          start_at: string | null;
          end_at: string | null;
          start_date: string | null;
          end_date: string | null;
          is_all_day: boolean;
          has_attendees: boolean;
          organizer_email: string | null;
          etag: string | null;
          html_link: string | null;
          time_zone: string | null;
          visibility: string | null;
          transparency: string | null;
          private_properties: Json | null;
          google_updated_at: string | null;
          updated_at: string;
        };
        Insert: {
          event_key: string;
          user_id: string;
          calendar_id: string;
          space_id?: string | null;
          provider_event_id: string;
          recurring_event_id?: string | null;
          original_start_time?: string | null;
          status?: string;
          summary?: string;
          description?: string | null;
          location?: string | null;
          meeting_url?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_all_day?: boolean;
          has_attendees?: boolean;
          organizer_email?: string | null;
          etag?: string | null;
          html_link?: string | null;
          time_zone?: string | null;
          visibility?: string | null;
          transparency?: string | null;
          private_properties?: Json | null;
          google_updated_at?: string | null;
          updated_at?: string;
        };
        Update: {
          event_key?: string;
          user_id?: string;
          calendar_id?: string;
          space_id?: string | null;
          provider_event_id?: string;
          recurring_event_id?: string | null;
          original_start_time?: string | null;
          status?: string;
          summary?: string;
          description?: string | null;
          location?: string | null;
          meeting_url?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_all_day?: boolean;
          has_attendees?: boolean;
          organizer_email?: string | null;
          etag?: string | null;
          html_link?: string | null;
          time_zone?: string | null;
          visibility?: string | null;
          transparency?: string | null;
          private_properties?: Json | null;
          google_updated_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          space_id: string | null;
          sub_space_id: string | null;
          duration: number | null;
          start_date: string | null;
          deadline: string | null;
          priority: string;
          status: string;
          auto_schedule: boolean;
          min_block_minutes: number | null;
          max_block_minutes: number | null;
          calendar_visibility: string | null;
          calendar_transparency: string | null;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          title: string;
          space_id?: string | null;
          sub_space_id?: string | null;
          duration?: number | null;
          start_date?: string | null;
          deadline?: string | null;
          priority?: string;
          status?: string;
          auto_schedule?: boolean;
          min_block_minutes?: number | null;
          max_block_minutes?: number | null;
          calendar_visibility?: string | null;
          calendar_transparency?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          space_id?: string | null;
          sub_space_id?: string | null;
          duration?: number | null;
          start_date?: string | null;
          deadline?: string | null;
          priority?: string;
          status?: string;
          auto_schedule?: boolean;
          min_block_minutes?: number | null;
          max_block_minutes?: number | null;
          calendar_visibility?: string | null;
          calendar_transparency?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      task_scheduling_preferences: {
        Row: {
          user_id: string;
          enabled: boolean;
          timezone: string | null;
          work_windows: Json;
          default_min_block_minutes: number;
          default_max_block_minutes: number;
          default_calendar_visibility: string;
          default_calendar_transparency: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          enabled?: boolean;
          timezone?: string | null;
          work_windows?: Json;
          default_min_block_minutes?: number;
          default_max_block_minutes?: number;
          default_calendar_visibility?: string;
          default_calendar_transparency?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          enabled?: boolean;
          timezone?: string | null;
          work_windows?: Json;
          default_min_block_minutes?: number;
          default_max_block_minutes?: number;
          default_calendar_visibility?: string;
          default_calendar_transparency?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      task_schedule_blocks: {
        Row: {
          id: string;
          user_id: string;
          task_id: string;
          space_id: string | null;
          work_session_id: string | null;
          calendar_id: string;
          provider_event_id: string | null;
          provider_event_key: string | null;
          start_at: string;
          end_at: string;
          planned_start_at: string;
          planned_end_at: string;
          state: string;
          sync_version: number;
          etag: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          task_id: string;
          space_id?: string | null;
          work_session_id?: string | null;
          calendar_id: string;
          provider_event_id?: string | null;
          provider_event_key?: string | null;
          start_at: string;
          end_at: string;
          planned_start_at: string;
          planned_end_at: string;
          state?: string;
          sync_version?: number;
          etag?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          task_id?: string;
          space_id?: string | null;
          work_session_id?: string | null;
          calendar_id?: string;
          provider_event_id?: string | null;
          provider_event_key?: string | null;
          start_at?: string;
          end_at?: string;
          planned_start_at?: string;
          planned_end_at?: string;
          state?: string;
          sync_version?: number;
          etag?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      task_schedule_status: {
        Row: {
          user_id: string;
          task_id: string;
          state: string;
          scheduled_minutes: number;
          missing_minutes: number;
          worked_minutes: number;
          remaining_minutes: number;
          active_session_id: string | null;
          missed_minutes: number;
          warning: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          task_id: string;
          state: string;
          scheduled_minutes?: number;
          missing_minutes?: number;
          worked_minutes?: number;
          remaining_minutes?: number;
          active_session_id?: string | null;
          missed_minutes?: number;
          warning?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          task_id?: string;
          state?: string;
          scheduled_minutes?: number;
          missing_minutes?: number;
          worked_minutes?: number;
          remaining_minutes?: number;
          active_session_id?: string | null;
          missed_minutes?: number;
          warning?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      task_work_sessions: {
        Row: {
          id: string;
          user_id: string;
          task_id: string;
          space_id: string | null;
          calendar_id: string | null;
          block_id: string | null;
          provider_event_id: string | null;
          provider_event_key: string | null;
          source: string;
          state: string;
          started_at: string;
          stopped_at: string | null;
          original_started_at: string;
          original_stopped_at: string | null;
          planned_start_at: string | null;
          planned_end_at: string | null;
          worked_seconds: number;
          estimated_minutes_at_start: number | null;
          calendar_sync_state: string;
          repair_needed: boolean;
          warning: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          task_id: string;
          space_id?: string | null;
          calendar_id?: string | null;
          block_id?: string | null;
          provider_event_id?: string | null;
          provider_event_key?: string | null;
          source?: string;
          state?: string;
          started_at: string;
          stopped_at?: string | null;
          original_started_at: string;
          original_stopped_at?: string | null;
          planned_start_at?: string | null;
          planned_end_at?: string | null;
          worked_seconds?: number;
          estimated_minutes_at_start?: number | null;
          calendar_sync_state?: string;
          repair_needed?: boolean;
          warning?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          task_id?: string;
          space_id?: string | null;
          calendar_id?: string | null;
          block_id?: string | null;
          provider_event_id?: string | null;
          provider_event_key?: string | null;
          source?: string;
          state?: string;
          started_at?: string;
          stopped_at?: string | null;
          original_started_at?: string;
          original_stopped_at?: string | null;
          planned_start_at?: string | null;
          planned_end_at?: string | null;
          worked_seconds?: number;
          estimated_minutes_at_start?: number | null;
          calendar_sync_state?: string;
          repair_needed?: boolean;
          warning?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      task_active_session_owners: {
        Row: {
          user_id: string;
          session_id: string;
          task_id: string;
          claimed_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          session_id: string;
          task_id: string;
          claimed_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          session_id?: string;
          task_id?: string;
          claimed_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      task_work_session_revisions: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          old_started_at: string;
          old_stopped_at: string | null;
          new_started_at: string;
          new_stopped_at: string | null;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          old_started_at: string;
          old_stopped_at?: string | null;
          new_started_at: string;
          new_stopped_at?: string | null;
          reason: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string;
          old_started_at?: string;
          old_stopped_at?: string | null;
          new_started_at?: string;
          new_stopped_at?: string | null;
          reason?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      task_calendar_repairs: {
        Row: {
          id: number;
          user_id: string;
          session_id: string | null;
          block_id: string | null;
          calendar_id: string;
          provider_event_id: string | null;
          operation: string;
          status: string;
          attempts: number;
          next_attempt_at: string;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          session_id?: string | null;
          block_id?: string | null;
          calendar_id: string;
          provider_event_id?: string | null;
          operation: string;
          status?: string;
          attempts?: number;
          next_attempt_at?: string;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          session_id?: string | null;
          block_id?: string | null;
          calendar_id?: string;
          provider_event_id?: string | null;
          operation?: string;
          status?: string;
          attempts?: number;
          next_attempt_at?: string;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      task_timer_operation_receipts: {
        Row: {
          id: number;
          user_id: string;
          operation_key: string;
          operation: string;
          response: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          operation_key: string;
          operation: string;
          response: Json;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          operation_key?: string;
          operation?: string;
          response?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      scheduler_queue: {
        Row: {
          user_id: string;
          reason: string;
          requested_at: string;
          run_after: string;
          attempts: number;
          locked_at: string | null;
          last_error: string | null;
          force_replan: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          reason?: string;
          requested_at?: string;
          run_after?: string;
          attempts?: number;
          locked_at?: string | null;
          last_error?: string | null;
          force_replan?: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          reason?: string;
          requested_at?: string;
          run_after?: string;
          attempts?: number;
          locked_at?: string | null;
          last_error?: string | null;
          force_replan?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      task_schedule_cleanup: {
        Row: {
          id: number;
          user_id: string;
          calendar_id: string;
          provider_event_id: string;
          created_at: string;
          processed_at: string | null;
          last_error: string | null;
        };
        Insert: {
          id?: number;
          user_id: string;
          calendar_id: string;
          provider_event_id: string;
          created_at?: string;
          processed_at?: string | null;
          last_error?: string | null;
        };
        Update: {
          id?: number;
          user_id?: string;
          calendar_id?: string;
          provider_event_id?: string;
          created_at?: string;
          processed_at?: string | null;
          last_error?: string | null;
        };
        Relationships: [];
      };
      scheduler_user_locks: {
        Row: {
          user_id: string;
          locked_at: string;
          lock_token: string;
        };
        Insert: {
          user_id: string;
          locked_at?: string;
          lock_token: string;
        };
        Update: {
          user_id?: string;
          locked_at?: string;
          lock_token?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      try_claim_scheduler_lock: {
        Args: { p_lock_token: string; p_user_id: string };
        Returns: boolean;
      };
      refresh_scheduler_lock: {
        Args: { p_lock_token: string; p_user_id: string };
        Returns: boolean;
      };
      release_scheduler_lock: {
        Args: { p_lock_token: string; p_user_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
