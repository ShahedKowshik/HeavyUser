# HeavyUser — compact workspace
## Intent
Reduce visual noise and redundant copy. Keep each area single-purpose:
- Left rail: Today, All habits, Archive and Account.
- Habit list: compact selection and status, no decorative blocks.
- Detail pane: recording, 30-day statistics, 14-day trend and recent history for one selected habit.
- Mobile: list first, then selected details with a back control.

## Archive and permanent deletion
- Archiving makes a habit inactive and retains all daily records and work sessions.
- Archive section allows restoring or permanently deleting.
- Permanent delete requires typing the exact habit name and is available only for archived habits.
- Deletion uses an owner-scoped DELETE on public.habits, checked for one returned row.
- The existing foreign keys in Supabase (habit_entries and work_sessions → habits) are ON DELETE CASCADE. Their rows are permanently removed when the habit is deleted.
- Nothing is deleted automatically during deploy. Existing data is preserved.

## Implementation
- Desktop has a narrow navigation rail, a 317px habit list and flexible detail pane.
- Layout lives in `src/app/compact.css`.
- Existing dialogs remain for creating, editing, logging and sleep records.
- All habit data remains behind Supabase Row Level Security.
