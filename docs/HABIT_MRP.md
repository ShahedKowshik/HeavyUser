# HeavyUser 2.0 — Minimum Remarkable Product extension
Selected features: weekly grid, monthly calendar, flexible goals, day statuses, bad-habit analytics, habit-specific stats, reversible changes, and ordering.

## Product research and decisions
- Habitify's weekly Journal and web Grid show each habit against weekdays, distinguish completed/skipped/failed/partial, and allow direct interactions: https://intercom.help/habitify-app/en/articles/17336614-week-view-of-journal-see-your-habit-progress-in-a-week and https://intercom.help/habitify-app/en/articles/11203298-track-progress-of-habits-on-website-desktop-app
- Habitify weekly goals count whole-period success; we avoid confusing daily streaks with weekly streaks: https://intercom.help/habitify-app/en/articles/9728009-create-track-a-weekly-habit
- Habitify supports personal ordering and sorting in its web grid: https://intercom.help/habitify-app/en/articles/11203786-sort-manage-habits-on-website-desktop-app
- TickTick allows historical log correction via calendar: https://help.ticktick.com/articles/7055792921664028672
- Users object to weekly habits being tied to a fixed weekday: https://www.reddit.com/r/ticktick/comments/1sw1e5v/ticktick_weekly_habits_surely_theres_a_better_way/
- Habit formation is variable; a missed opportunity need not undo automaticity: https://doi.org/10.1002/ejsp.674
- Review of 41 digital habit interventions found self-monitoring and goal-setting recurring techniques, not proof that streak pressure is optimal: https://www.jmir.org/2024/1/e54375/

## Definitions
- Unknown / unrecorded is never treated as zero or failure.
- Skipped is intentional and is excluded from success; missed means explicitly marked not achieved.
- Counter for a negative habit is successful only on a completed prior day with a confirmed value within its limit. Today is provisional.
- Weekly and monthly flexible goals count successful unique days, not raw taps, and never require a particular weekday.
- Alternate-day schedules anchor to the habit's original start date.
- Historical targets and frequency settings are versioned; prior logged target snapshots stay intact.
- For smoking, a seven-day average uses verified days only. Show coverage and show comparative reduction only with at least 4 samples in each week.
- Undo for counters only reverses the latest relevant event. For historic edits, the latest revision of a non-counter entry can be restored; conflicting new changes require refresh.
- Ordering is one canonical user-specific ordering, shared across Today, All and Week; mobile has up/down controls and desktop supports drag/drop.
- Default view remains Today for fastest capture. Week is a single additional main view. Calendar and analysis live inside the selected habit's detail pane.

## Supabase migrations already applied (production)
1. `habit_frequencies_statuses_audit_order_preferences`
2. `undo_rpcs_and_historical_schedule_versions`
3. `idempotent_undo_operations`
4. `clear_ignored_status_on_new_quantity_log`
5. `allow_cascading_habit_deletion_with_entry_audit`

All tables have row-level security; privileged routines authenticate and scope to the current user. No existing records were intentionally changed by the migrations.

## Validation checklist
- Weekly goal of 3 sessions: Monday/Wednesday/Friday meets the goal, Sunday-only does not.
- Unknown, skipped, missed, done, partial, within-limit, and over-limit are visibly different.
- Backfill on a past day and undo does not mutate a newer entry.
- Quantity undo is idempotent and cannot accidentally reverse a newer entry.
- Rapid + and − actions keep their existing idempotent queue behavior.
- Drag/order on desktop, Move up/Move down on touch devices.
- Week-start preference persists per account.
- Narrow phone with keyboard open, long habit names, and 30-day calendar navigation.
