-- Keep work history when its task is deleted, while clearing only the
-- schedule-block link. The account id must remain present on the history row.
alter table public.task_work_sessions
  drop constraint if exists task_work_sessions_block_fk;

alter table public.task_work_sessions
  add constraint task_work_sessions_block_fk
  foreign key (user_id, block_id)
  references public.task_schedule_blocks(user_id, id)
  on delete set null (block_id);
