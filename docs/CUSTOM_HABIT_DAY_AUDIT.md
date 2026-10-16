# Logical habit days, start dates, and sign-out safety

## Audit findings
- Client and quantity RPC previously assumed midnight in Asia/Dhaka despite users whose sleep/wake patterns cross midnight.
- User preferences only stored the week start; no per-user rollover time or timezone.
- The habits table already had a start_date, but the user could not set it in the habit editor; analytics assumed it.
- Timer durations previously used rigid GMT+6 calendar midnights (not DST, not user-defined day).
- Sleep date input conversion fixed UTC+6 even when traveling.
- Bad-habit zero-day counts did not exclude pre-start history.
- Account settings signed out directly, causing accidental logouts.
- Pending offline counter operations must remain recoverable and must not be abandoned by intentional sign-out.

## Source research
- Habitify start date: https://intercom.help/habitify-app/en/articles/11203157-add-a-new-habit-on-website-desktop-app
- Habitify daily reset midnight: https://intercom.help/habitify-app/en/articles/7990118-manage-the-time-of-day
- Habitify community requests late-night reset: https://feedback.habitify.me/p/start-day-at
- TickTick distinguishes calendar start/hidden time from tracking-day rollover: https://blog.ticktick.com/2020/11/30/ticktick-calendar-quickstart/

## Product decisions
1. Current existing accounts retain midnight reset and Asia/Dhaka timezone until they change the setting. No surprise shifts.
2. Account settings > Day & calendar: day starts at 00:00–23:59, using 15-minute inputs; user's IANA timezone is stored alongside the boundary.
3. Date label is the logical day (the day on which its opening reset occurs). At Oct 16 01:30 AM with 03:00 cutoff, Today reads October 15.
4. Every data action and analytics calculation accepts the same selected logical date. UTC timestamps remain real and never rewound.
5. Changing preferences does not change existing entries' saved local_date or silently reassign old quantities.
6. Timer sessions are attributed across logical day boundaries, respecting DST. Existing aggregate pauses are prorated across boundaries because pause intervals were not historically stored.
7. New habits default their start date to the *current logical day*; the user may choose past or future. Pre-start days are excluded, never successes or misses.
8. Moving an existing habit's start later than any historical entry/revision/counter/timer session is rejected by the database to avoid invisibly hiding history.
9. Archive and edit preserve start date.
10. Explicit sign-out confirmation with Stay signed in as the default and disabled Sign out while offline counter changes remain unsynced.
11. Day preferences are included in personal data export.
12. Month/week chart navigation can inspect the past and the day switches automatically at the selected reset when following Today.

## Test matrix
- Midnight and custom boundaries, exact reset minute, cross-month/year, DST spring and fall, uncommon timezone offsets.
- Habit start today, start future, start earlier than existing history, start moved later across existing data.
- Counter operations and event idempotency after midnight and offline replay after cutover.
- Duration sessions spanning reset, while running, and paused totals.
- Sleep timestamps after midnight remain truthful in UTC.
- Pending counter queue prevents logout; accident click requires secondary confirmation.
- Multiple devices using the same account retrieve identical preferences after a refresh.
- Existing preferences remain backward-compatible.
- SQL triggers protect against hidden history and invalid timezone; auth policies remain unchanged.

## Outstanding manual verification
Signed-in use on actual Android/Mac, 320–430px widths, date picker interaction at 02:59 and 03:00 local, daylight-saving browsers, and simultaneous-device editing. Automated build, unit tests, and rollback SQL tests do not establish complete end-to-end proof.
