# HeavyUser product guide

This guide describes the current habit tracker, not a list of promised future features.

## Start with a habit

1. Create a habit and give it a recognizable name.
2. Choose how to track it: a check-off, a quantity, an elapsed duration, or sleep.
3. Set a goal and a schedule that match the activity.
4. Record progress from Today or the relevant habit detail.
5. Review the Week view, calendar, and insights to understand what happened.

## Tracking methods

| Method | Example | What is recorded |
| --- | --- | --- |
| Check-off | Brush teeth | Whether the habit was completed |
| Quantity | Cups of water or cigarettes | A numerical value, with a goal or limit |
| Duration | Reading or focused work | Time spent in a session or manual record |
| Sleep | Bedtime and wake time | Sleep-related timestamps and duration |

Quantity habits can track an **at least** target or an **at most** limit. A negative habit can therefore have a maximum allowed quantity, rather than a misleading minimum target.

## Schedules

- **Selected days:** Pick the weekdays on which a habit is expected.
- **Every N days:** Repeat at a defined interval, anchored to the habit's original start date.
- **Weekly goal:** Complete a number of successful days within the week, without assigning a mandatory weekday.
- **Monthly goal:** Complete a number of successful days within the month.

Week-start preference is stored per account. Historical schedule and goal changes are versioned for reporting purposes.

## Reading your progress

A blank day is **not automatically a failed day**.

| Status | Meaning |
| --- | --- |
| Completed | The recorded activity satisfied its applicable goal or was marked done |
| Partial | Progress was recorded but the goal was not met |
| On track | A quantity with a maximum limit is currently within that limit today; the day is not finalized |
| Over limit | A recorded quantity exceeded its limit |
| Skipped | The day was intentionally excluded |
| Missed | The day was explicitly marked not achieved |
| Unrecorded | No reliable record was entered |
| Not due | The habit was not scheduled for that day, or the date is in the future |

The status displayed can depend on the tracking method. Streaks and aggregated statistics do not equate absent measurements with zero.

## Historical corrections

Past-day entries can be corrected. Supported undo actions are designed to avoid overwriting newer edits. Quantity undo includes duplicate-operation and conflict safeguards, but some older events lack the information necessary to restore all historical metadata.

If the list and a statistic disagree, report the habit type, date, action sequence, and the two conflicting displays. Never share credentials or identifiable health information in a public issue.

## Keeping and exporting data

- **Archive:** Remove a habit from active tracking while retaining its history.
- **Restore:** Return an archived habit to active use.
- **Permanently delete:** Explicitly confirm deletion of an archived habit; related records are removed.
- **Export:** Account settings can download a JSON file containing habits, habit entries, and work sessions.

The available export is **not a guaranteed full account backup** of every database table or audit record. Keep copies if you need long-term portability.

## Current boundaries

- No advanced reminders, calendar syncing, or third-party integrations are included in this version.
- Detailed sleep records are user-entered estimates, not clinical measurements.
- The current frontend uses the **Asia/Dhaka** timezone for habit dates and time displays. International timezone handling requires further work before a broad global launch.
- This guide documents product behavior; it is not medical advice.
