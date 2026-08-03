update public.google_calendar_sync_states
set sync_token = null,
    last_synced_at = null,
    updated_at = now()
where sync_token is not null;
