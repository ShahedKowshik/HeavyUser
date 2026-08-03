alter table public.task_schedule_blocks
  add column if not exists sync_version integer not null default 0;

alter table public.task_schedule_blocks
  drop constraint if exists task_schedule_blocks_sync_version_check;

alter table public.task_schedule_blocks
  add constraint task_schedule_blocks_sync_version_check check (sync_version >= 0);
