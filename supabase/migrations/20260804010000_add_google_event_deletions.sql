create table if not exists public.google_calendar_event_deletions (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  provider_event_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, event_key)
);

create index if not exists google_calendar_event_deletions_provider_idx
  on public.google_calendar_event_deletions (user_id, provider_event_id);

alter table public.google_calendar_event_deletions enable row level security;

revoke all on public.google_calendar_event_deletions from anon, authenticated;
grant select, insert, update, delete on public.google_calendar_event_deletions to service_role;
