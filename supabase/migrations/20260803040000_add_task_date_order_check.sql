alter table public.tasks
  drop constraint if exists tasks_date_order_check;

alter table public.tasks
  add constraint tasks_date_order_check check (
    start_date is null or deadline is null or start_date <= deadline
  );
