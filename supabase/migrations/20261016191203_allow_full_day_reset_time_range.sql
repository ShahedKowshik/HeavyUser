
alter table public.user_preferences
 drop constraint if exists user_preferences_day_start_minutes_range;
alter table public.user_preferences
 add constraint user_preferences_day_start_minutes_range
 check(day_start_minutes between 0 and 1439);
