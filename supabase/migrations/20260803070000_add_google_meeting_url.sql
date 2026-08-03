alter table public.google_calendar_events
  add column if not exists meeting_url text;
