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
      google_calendar_sync_states: {
        Row: {
          user_id: string;
          sync_token: string | null;
          channel_id: string | null;
          resource_id: string | null;
          channel_expiration: string | null;
          last_synced_at: string | null;
          last_error: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          sync_token?: string | null;
          channel_id?: string | null;
          resource_id?: string | null;
          channel_expiration?: string | null;
          last_synced_at?: string | null;
          last_error?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          sync_token?: string | null;
          channel_id?: string | null;
          resource_id?: string | null;
          channel_expiration?: string | null;
          last_synced_at?: string | null;
          last_error?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      google_calendar_events: {
        Row: {
          event_key: string;
          user_id: string;
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
          warning: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          task_id: string;
          state: string;
          scheduled_minutes?: number;
          missing_minutes?: number;
          warning?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          task_id?: string;
          state?: string;
          scheduled_minutes?: number;
          missing_minutes?: number;
          warning?: string | null;
          updated_at?: string;
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
        };
        Insert: {
          user_id: string;
          locked_at?: string;
        };
        Update: {
          user_id?: string;
          locked_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      try_claim_scheduler_lock: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      release_scheduler_lock: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
