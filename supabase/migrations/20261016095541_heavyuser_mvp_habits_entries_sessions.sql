
create table if not exists public.habits (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 100),
 kind text not null check (kind in ('check','quantity','duration','sleep')),
 icon text not null default 'sparkles',
 color text not null default 'sage',
 unit text not null default '',
 target numeric(12,2) not null default 1 check (target >= 0 and target <= 100000),
 direction text not null default 'at_least' check (direction in ('at_least','at_most')),
 schedule_days smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
 start_date date not null default (now() at time zone 'Asia/Dhaka')::date,
 sleep_bedtime_goal time,
 sleep_wake_goal time,
 sleep_duration_goal integer check(sleep_duration_goal between 0 and 1440),
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,user_id),
 check(array_length(schedule_days,1) between 1 and 7),
 check(schedule_days <@ array[0,1,2,3,4,5,6]::smallint[])
);
create table if not exists public.habit_entries (
 id uuid primary key default gen_random_uuid(),
 habit_id uuid not null,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 local_date date not null,
 value numeric(12,2) check(value is null or value between 0 and 100000),
 completed boolean,
 confirmed boolean not null default true,
 bed_at timestamptz,
 asleep_at timestamptz,
 awake_at timestamptz,
 out_of_bed_at timestamptz,
 target_snapshot numeric(12,2),
 direction_snapshot text check(direction_snapshot is null or direction_snapshot in ('at_least','at_most')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(habit_id,local_date),
 foreign key(habit_id,user_id) references public.habits(id,user_id) on delete cascade,
 check(asleep_at is null or bed_at is null or asleep_at >= bed_at),
 check(awake_at is null or asleep_at is null or awake_at >= asleep_at),
 check(out_of_bed_at is null or awake_at is null or out_of_bed_at >= awake_at),
 check(awake_at is null or bed_at is null or awake_at - bed_at <= interval '36 hours')
);
create table if not exists public.work_sessions (
 id uuid primary key default gen_random_uuid(),
 habit_id uuid not null,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 started_at timestamptz not null default now(),
 ended_at timestamptz,
 paused_at timestamptz,
 paused_total_ms bigint not null default 0 check(paused_total_ms >= 0),
 created_at timestamptz not null default now(),
 foreign key(habit_id,user_id) references public.habits(id,user_id) on delete cascade,
 check(ended_at is null or ended_at >= started_at),
 check(paused_at is null or ended_at is null),
 check(paused_at is null or paused_at >= started_at)
);
create unique index if not exists only_one_active_timer_per_user on public.work_sessions(user_id) where ended_at is null;
create index if not exists habits_owner_created on public.habits(user_id,created_at);
create index if not exists entries_owner_day on public.habit_entries(user_id,local_date desc);
create index if not exists sessions_owner_start on public.work_sessions(user_id,started_at desc);
alter table public.habits enable row level security;
alter table public.habit_entries enable row level security;
alter table public.work_sessions enable row level security;
create policy "Own habits read" on public.habits for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own habits insert" on public.habits for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own habits update" on public.habits for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own habits delete" on public.habits for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Own entries read" on public.habit_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own entries insert" on public.habit_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own entries update" on public.habit_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own entries delete" on public.habit_entries for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Own sessions read" on public.work_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own sessions insert" on public.work_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own sessions update" on public.work_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own sessions delete" on public.work_sessions for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.habits, public.habit_entries, public.work_sessions from anon;
grant select,insert,update,delete on public.habits, public.habit_entries, public.work_sessions to authenticated;
