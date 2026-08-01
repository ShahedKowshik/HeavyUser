create table if not exists public.google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_account_email text,
  selected_calendar_id text,
  selected_calendar_name text,
  selected_calendar_timezone text,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  access_token_expires_at timestamptz,
  granted_scope text,
  status text not null default 'awaiting_calendar' check (status in ('awaiting_calendar', 'connected', 'error')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_calendar_sync_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sync_token text,
  channel_id text unique,
  resource_id text,
  channel_expiration timestamptz,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.google_calendar_events (
  event_key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_event_id text not null,
  recurring_event_id text,
  original_start_time timestamptz,
  status text not null default 'confirmed',
  summary text not null default '',
  description text,
  location text,
  start_at timestamptz,
  end_at timestamptz,
  start_date date,
  end_date date,
  is_all_day boolean not null default false,
  has_attendees boolean not null default false,
  organizer_email text,
  etag text,
  html_link text,
  time_zone text,
  google_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists google_calendar_events_user_start_idx
  on public.google_calendar_events (user_id, start_at);

create index if not exists google_calendar_events_user_date_idx
  on public.google_calendar_events (user_id, start_date);

alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_sync_states enable row level security;
alter table public.google_calendar_events enable row level security;

grant select, insert, update, delete on public.google_calendar_connections to authenticated;
grant select, insert, update, delete on public.google_calendar_sync_states to authenticated;
grant select, insert, update, delete on public.google_calendar_events to authenticated;

drop policy if exists "Users can view their Google calendar connection" on public.google_calendar_connections;
create policy "Users can view their Google calendar connection"
on public.google_calendar_connections for select
to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their Google calendar connection" on public.google_calendar_connections;
create policy "Users can manage their Google calendar connection"
on public.google_calendar_connections for all
to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their Google calendar sync state" on public.google_calendar_sync_states;
create policy "Users can manage their Google calendar sync state"
on public.google_calendar_sync_states for all
to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their Google calendar events" on public.google_calendar_events;
create policy "Users can view their Google calendar events"
on public.google_calendar_events for select
to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their Google calendar events" on public.google_calendar_events;
create policy "Users can manage their Google calendar events"
on public.google_calendar_events for all
to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
