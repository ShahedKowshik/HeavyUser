# Automatic task scheduling

HeavyUser keeps task definitions in Supabase and creates only its own timed blocks in the selected Google Calendar.

## How a task is scheduled

- A task must have a duration and be open. Automatic scheduling is always on; tasks without an estimate stay unscheduled until one is added.
- Dated tasks are ranked by priority and then deadline. Undated tasks use the remaining free time after dated work is protected.
- Work is placed inside the weekly windows in Settings. Weekends are off unless explicitly configured.
- Long tasks are split using the account defaults, with optional per-task overrides.
- A moved or resized HeavyUser block becomes locked. Deleting a HeavyUser block asks the scheduler to place that work again.
- Locked blocks are never moved by normal scheduling. Changing a task's priority is an explicit replan request, so its future blocks (including locked ones) may move; past blocks never move.
- If a meeting overlaps a protected block, both stay and the task is marked At risk with a conflict warning.
- Calendar time never marks a task complete. The user must complete the task in HeavyUser.

## Live work timer

- Start requires a writable Google Calendar. It moves the next HeavyUser block to the exact start time, even outside saved work windows or dates.
- If the current time is busy, Start offers overlap or next free time. Choosing next free time schedules the task but leaves the timer stopped.
- Stop uses the exact stop time, saves actual work separately from the estimate, cuts the owned event, and schedules the unused estimate again. A short session is kept in history without leaving a tiny calendar event.
- Add time extends the active block from the current moment. If work runs past the maximum block length, Stop can keep one long event or split the actual range into bounded HeavyUser blocks.
- The timer belongs to the account, not a browser tab. Refreshing, signing out, or opening a second device does not lose it; starting another task stops the current one first.
- Reaching the estimate is a reminder, not completion. Completing a running task stops its timer, removes future blocks, and marks it done.
- Moving a running task to another Space leaves the active block where work started and sends only future work to the new Space.
- Manual Log work creates a past HeavyUser event when the task can be scheduled. No-estimate and completed-task logs remain history-only.
- Work history can be corrected with a reason; the original range stays in the audit history and the owned event is updated when Google is available.
- Google-side edits or deletion of the active event pause the timer for review. App drag and resize are disabled while that timer is active. Failed Google writes are saved as repair work and retried automatically.
- A past block with no timer or Log work is missed, counts as zero work, and its full time is scheduled again.

## Background repair

Task changes and Google Calendar syncs create one deduplicated row in `scheduler_queue`. The authenticated workspace calls `/api/scheduler/run` immediately after a task save. Saving working hours also runs the scheduler before confirming the settings change, so removing today’s window moves flexible work into the next available window right away. A protected worker must also call `/api/scheduler/process` once per minute so changes are repaired when the workspace is closed.

Each weekday can be marked `All day`. In normal mode this means the full calendar day. With Night Owl mode enabled, it means the full logical day beginning at the configured day-start time and ending at that time the following day. Calendar conflicts and task block limits still apply.

Only one run per user is allowed at a time. A short-lived database lock and idempotent block/event IDs make two devices and retrying requests safe. Failed Google calls remain queued with 1, 5, 15, and 60 minute backoff windows.

The worker endpoint requires:

```text
Authorization: Bearer <CRON_SECRET>
```

Store `CRON_SECRET` in the deployed Next.js environment and in Supabase Vault. For deployments that keep only a digest in the app, set `CRON_SECRET_HASH` to the SHA-256 digest of the bearer value instead. Use Supabase Cron with `pg_net` to call the deployed endpoint every minute. The worker endpoint is intentionally not protected by the browser login redirect; it returns `401` unless the bearer secret is correct. Do not commit either value to this repository.

## Google event ownership

Task blocks carry private Google event properties:

- `heavyuser=task-block`
- `heavyuserTaskId=<task id>`
- `heavyuserBlockId=<block id>`

The scheduler also supplies a deterministic event ID. This makes retries safe and lets HeavyUser recover a task link after a process interruption.

Changing calendars removes future HeavyUser blocks from the old calendar before rebuilding them on the new one. Disconnecting Calendar makes a best-effort cleanup pass, pauses task scheduling, and leaves any cleanup error visible for the next reconnect.

## Task states

The task list keeps the existing one-line layout. Opening a task shows its schedule state and current calendar blocks with dates, times, and locked/past state: Scheduled, Scheduling, Needs duration, At risk, Locked, Awaiting completion, Paused, or Calendar error. A passed block never completes the task; it becomes Awaiting completion until the user marks the task done.

Scheduling is permanently on. Existing paused flags are treated as on during migration, while work windows remain configurable. HeavyUser shows a calendar block only after Google Calendar accepts it, so a task that is still being scheduled does not appear at a guessed time.
